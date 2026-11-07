# Backend FunBike

API PHP avec stockage JSON. Le catalogue reste consultable publiquement. Les modifications du catalogue sont réservées aux admins et la gestion des comptes est réservée à un **superadmin unique**.

Prérequis : PHP 7.4 ou supérieur (PHP 8 recommandé), les sessions PHP activées et un dossier privé accessible en écriture par PHP.

## 1. Rôles et permissions

| Action | Visiteur | Admin | Superadmin |
|---|---:|---:|---:|
| Consulter les API publiques en `GET` | Oui | Oui | Oui |
| Se connecter et changer son propre mot de passe | Non | Oui | Oui |
| Ajouter, modifier ou supprimer le contenu du catalogue | Non | Oui | Oui |
| Consulter la liste sécurisée des utilisateurs | Non | Non | Oui |
| Créer un admin | Non | Non | Oui |
| Réinitialiser le mot de passe d'un autre admin | Non | Non | Oui |
| Supprimer un autre admin | Non | Non | Oui |
| Créer ou supprimer un superadmin | Non | Non | Non |

Tout compte nouvellement créé ou réinitialisé reçoit un mot de passe temporaire. Après sa connexion, `mustChangePassword` vaut `true` et il doit immédiatement choisir un nouveau mot de passe. Tant que cette étape n'est pas terminée, il ne peut ni gérer le catalogue ni gérer les utilisateurs.

## 2. Créer le seul superadmin

Cette commande ne fonctionne que lorsque `users.json` ne contient **aucun compte** :

```bash
php server/scripts/create-admin.php admin
```

Elle crée le superadmin initial et affiche son mot de passe temporaire. Après cela, toute nouvelle tentative avec cette commande échoue : les autres comptes doivent être créés par le superadmin depuis l'interface d'administration.

Aucun compte ni mot de passe par défaut n'est inclus dans Git.

### Migrer une ancienne installation

Les comptes créés par l'ancienne version ont le rôle `admin`. Pour transformer **un compte existant** en superadmin sans créer un nouveau compte :

```bash
php server/scripts/promote-superadmin.php nom_du_compte_existant
```

Cette migration fonctionne uniquement s'il n'existe pas déjà un autre superadmin. Elle révoque les anciennes sessions du compte promu.

### Récupération d'urgence du superadmin

Si le superadmin a oublié son mot de passe :

```bash
php server/scripts/reset-admin-password.php nom_superadmin
```

Cette commande CLI est réservée au superadmin. Elle ne permet plus de réinitialiser un admin ordinaire : cette action appartient au superadmin via l'API. Elle révoque les sessions existantes et impose le changement du temporaire à la prochaine connexion.

Pour un déploiement automatisé, `FUNBIKE_TEMP_PASSWORD` peut fournir le temporaire. Ne jamais enregistrer cette valeur dans Git ou dans une URL.

## 3. Connexion et changement obligatoire

### Connexion

```http
POST /server/api/auth/login.php
Content-Type: application/json

{
  "username": "admin",
  "password": "MOT_DE_PASSE_TEMPORAIRE"
}
```

La réponse contient le rôle (`admin` ou `superadmin`) et `mustChangePassword`. Si ce dernier vaut `true`, le frontend doit afficher uniquement la page de changement de mot de passe.

### Changement du mot de passe du compte connecté

```http
POST /server/api/auth/change-password.php
Content-Type: application/json

{
  "currentPassword": "MOT_DE_PASSE_TEMPORAIRE",
  "newPassword": "UN_NOUVEAU_MDP_DU_USER",
  "newPasswordConfirmation": "UN_NOUVEAU_MDP_DU_USER"
}
```

Le nouveau mot de passe doit comporter entre 12 et 72 octets et être différent de l'ancien. Après cette étape, `mustChangePassword` devient `false`.

Autres routes de session :

- `GET /server/api/auth/me.php` : compte connecté, rôle et état du changement obligatoire ;
- `POST /server/api/auth/logout.php` : déconnexion.

## 4. Gestion des utilisateurs par le superadmin

Toutes ces routes exigent une session superadmin dont le mot de passe temporaire a déjà été changé. Un admin ordinaire reçoit `403 SUPERADMIN_REQUIRED`.

### Lister les comptes sans donnée sensible

```http
GET /server/api/auth/users.php
```

La réponse contient uniquement `id`, `username`, `role`, `mustChangePassword`, `createdAt` et `updatedAt`. Elle ne contient jamais `passwordHash` ni de mot de passe.

### Créer un admin

```http
POST /server/api/auth/users.php
Content-Type: application/json

{
  "username": "nouvel_admin"
}
```

Le serveur impose le rôle `admin`, même si une autre valeur de rôle est envoyée. Il génère un mot de passe temporaire et le retourne **une seule fois** dans `temporaryPassword` au superadmin. Celui-ci doit le transmettre par un canal privé. Le nouvel admin devra le changer à sa première connexion.

### Réinitialiser le mot de passe d'un autre admin

```http
PUT /server/api/auth/users.php?id=ID_DE_L_ADMIN
```

Un nouveau temporaire est retourné une seule fois au superadmin. Les anciennes sessions de l'admin sont révoquées et `mustChangePassword` redevient `true`.

Cette route refuse de réinitialiser le compte superadmin connecté : pour son propre mot de passe, il utilise `change-password.php`.

### Supprimer un autre admin

```http
DELETE /server/api/auth/users.php?id=ID_DE_L_ADMIN
```

L'admin supprimé ne peut plus utiliser ses sessions. Le superadmin ne peut pas supprimer son propre compte et aucune route ne permet de supprimer le superadmin.

## 5. Intégration frontend

Le cookie doit accompagner les requêtes de session, les écritures du catalogue et la gestion des utilisateurs :

```js
async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const data = await response.json();

  if (!response.ok) {
    throw data;
  }

  return data;
}

await api("/server/api/auth/login.php", {
  method: "POST",
  body: JSON.stringify({ username, password })
});

await api("/server/api/auth/change-password.php", {
  method: "POST",
  body: JSON.stringify({
    currentPassword,
    newPassword,
    newPasswordConfirmation
  })
});
```

Pour les formulaires `FormData`, ajouter aussi `credentials: "include"`, mais ne pas définir manuellement `Content-Type` : le navigateur doit générer la frontière multipart.

Le frontend doit masquer la gestion des utilisateurs aux admins ordinaires, mais le backend refait obligatoirement cette vérification : cacher les boutons ne suffit pas.

## 6. Confidentialité de `users.json`

Les comptes sont enregistrés dans :

```text
storage/private/users.json
```

Structure interne :

```json
{
  "users": [
    {
      "id": "identifiant-aleatoire",
      "username": "admin",
      "passwordHash": "$2y$...",
      "role": "superadmin",
      "mustChangePassword": true,
      "authVersion": 1
    }
  ]
}
```

Les mots de passe temporaires et définitifs ne sont **jamais stockés en clair**. `password_hash()` crée l'empreinte et `password_verify()` vérifie la connexion.

Protections :

- aucun accès public au JSON ou à la liste des utilisateurs ;
- liste limitée au superadmin et nettoyée de toute donnée sensible ;
- `storage/.htaccess` refuse l'accès HTTP direct aux JSON sous Apache ;
- `api/_lib/.htaccess` et `scripts/.htaccess` bloquent les fichiers internes ;
- les scripts de gestion initiale/récupération refusent toute exécution hors CLI ;
- le vrai `users.json`, ses verrous et ses fichiers temporaires sont exclus de Git ;
- écriture atomique et verrouillage pour éviter un JSON corrompu.

### Apache

Vérifier que `.htaccess` est pris en compte (`AllowOverride All` ou au minimum `AllowOverride AuthConfig`). L'URL suivante doit répondre `403` ou `404`, jamais `200` :

```text
/server/storage/private/users.json
```

### Nginx ou hébergement sans `.htaccess`

Ajouter les règles équivalentes en adaptant le préfixe `/server` :

```nginx
location ^~ /server/storage/ { deny all; }
location ^~ /server/api/_lib/ { deny all; }
location ^~ /server/scripts/ { deny all; }
location ~* ^/server/uploads/.*\.(php[0-9]*|phtml|phar|cgi|pl|py|sh)(\.|/|$) { deny all; }
```

La protection la plus forte consiste à placer le fichier en dehors de la racine web :

```bash
export FUNBIKE_USERS_FILE=/chemin/prive/hors-web/funbike-users.json
```

Cette variable doit avoir la même valeur pour le serveur PHP et les commandes CLI.

### Serveur de développement PHP

`php -S localhost:4000` est pratique pour tester localement, mais il **ignore `.htaccess`**. Ne jamais l'utiliser comme serveur de production ni l'exposer publiquement. Tester la protection directe du JSON avec Apache/Nginx ou placer `FUNBIKE_USERS_FILE` hors de la racine servie.

## 7. Origines et HTTPS

Si React et l'API ont des origines différentes :

```bash
export FUNBIKE_ALLOWED_ORIGINS=https://www.funbike.mg,https://admin.funbike.mg
```

Les origines locales `localhost:3000`, `localhost:5173` et leurs équivalents `127.0.0.1` sont acceptées par défaut. L'origine du serveur est aussi acceptée. Une connexion ou une écriture portant l'en-tête `Origin` d'un site non autorisé reçoit `403 ORIGIN_NOT_ALLOWED`, même avec un cookie valide.

Le cookie est `HttpOnly` et utilise `SameSite=Lax` par défaut. Pour un frontend et une API sur des sites différents, utiliser HTTPS et :

```bash
export FUNBIKE_COOKIE_SAMESITE=None
export FUNBIKE_COOKIE_SECURE=1
```

Ne pas utiliser `SameSite=None` sans HTTPS en production.

## 8. Routes du catalogue

Les routes suivantes restent publiques en `GET` : marques, catégories, familles, modèles, types de produits, motos, casques, pièces détachées, équipements, dealers, contacts et nouveautés.

Leurs routes `POST`, `PUT` et `DELETE` utilisent `funbikeProtectWriteMethods()` :

- sans session : `401 AUTH_REQUIRED` ;
- avec un temporaire non changé : `403 PASSWORD_CHANGE_REQUIRED` ;
- avec un admin ou le superadmin connecté : action autorisée.

## 9. Champ `isEquipmentBrand` des marques

Chaque marque possède un booléen `isEquipmentBrand`. Les anciennes marques sans cette propriété sont automatiquement lues avec `false`.

Lors d'un `POST /server/api/brands.php`, le champ FormData est facultatif :

```text
name=Nom de la marque
logo=<fichier>
isEquipmentBrand=true
```

Sans `isEquipmentBrand`, la nouvelle marque est créée avec `false`. Les valeurs acceptées sont les booléens JSON et les valeurs FormData `true`, `false`, `1`, `0` ; une case HTML cochée avec `on` est aussi acceptée.

Pour modifier uniquement ce champ sans remplacer le logo :

```text
POST /server/api/brands.php?id=ID_DE_LA_MARQUE
FormData: _method=PUT
FormData: isEquipmentBrand=false
```

Lors d'un `PUT`, un champ absent conserve sa valeur précédente. Le logo n'est remplacé que si un nouveau fichier `logo` est envoyé.

## 10. Casques et équipements affichés sur l'accueil

Les fichiers `storage/data/products/helmets.json` et `storage/data/products/riding-gear.json` utilisent le booléen :

```json
"isEquipementAccueil": true
```

- `true` : le produit est sélectionné pour la section d'accueil ;
- `false` : le produit reste visible dans son catalogue, mais pas dans cette section ;
- champ absent sur un ancien produit : valeur lue comme `false` ;
- nouveau produit sans cette propriété : `false` par défaut.

Cette sélection est indépendante de `isNewArrival`, qui concerne les nouveautés.

Pour modifier le champ d'un casque avec un JSON :

```http
PUT /server/api/products/helmets.php?id=ID_DU_CASQUE
Content-Type: application/json

{
  "isEquipementAccueil": false
}
```

Utiliser `/server/api/products/riding-gear.php?id=ID_DE_L_EQUIPEMENT` pour un équipement. La valeur doit être un booléen JSON (`true` ou `false`), pas la chaîne `"false"`. Lors d'un `PUT`, un champ absent conserve sa valeur actuelle. Les formulaires multipart peuvent envoyer ces mêmes propriétés dans le champ JSON `product`.

La route publique dédiée à cette section est :

```text
GET /server/api/homepage-equipment.php
```

Elle renvoie au maximum les quatre premiers casques et équipements ayant à la fois `isEquipementAccueil: true` et `status: "PUBLISHED"`. Les produits marqués `false` et les brouillons sont exclus de `data`. Les compteurs `meta.markedCount`, `meta.publishedCount` et `meta.displayedCount` permettent de contrôler la sélection.

## 11. Familles et types de produits

Les familles sont enregistrées dans `storage/data/families.json` avec trois champs :

```json
{
  "id": "off-road",
  "name": "Off-road",
  "categoryId": "motos"
}
```

Le CRUD complet est disponible sur :

```text
GET    /server/api/families.php
POST   /server/api/families.php
PUT    /server/api/families.php?id=ID_DE_LA_FAMILLE
DELETE /server/api/families.php?id=ID_DE_LA_FAMILLE
```

Le `GET` est public. Les écritures exigent un admin ou le superadmin. Pour créer ou modifier une famille, envoyer `name` et `categoryId`. La catégorie doit exister. L'identifiant est généré depuis le nom à la création et reste stable lors d'un `PUT`.

Exemple de création :

```json
{
  "name": "Off-road",
  "categoryId": "motos"
}
```

### Associer un type de produit à une famille

`product-types.php` accepte maintenant le champ facultatif `familyId` :

```json
{
  "name": "Enduro",
  "categoryId": "motos",
  "familyId": "off-road"
}
```

Lorsqu'un `familyId` est fourni, le serveur vérifie que :

1. la famille existe dans `families.json` ;
2. son `categoryId` est identique à celui du type de produit.

Une famille inexistante ou appartenant à une autre catégorie produit une erreur `400`. Les types sans famille restent valides, notamment les casques, équipements, pièces détachées et accessoires.

Lors d'un `PUT` de type de produit :

- `familyId` absent et catégorie inchangée : la famille actuelle est conservée ;
- `familyId` fourni : la nouvelle association est validée puis enregistrée ;
- catégorie changée sans nouveau `familyId` : l'ancienne famille est retirée ;
- `familyId: null` ou `familyId: ""` : la famille est explicitement retirée.

Une famille utilisée par un type ne peut pas être supprimée. Modifier ou supprimer d'abord les types concernés.

## 12. Déploiement FTP et précautions

Depuis la racine du site, le dossier dans le dépôt s'appelle maintenant `server` et les URL commencent par `/server/`. Le build Vite crée `dist/index.html` : envoyer **le contenu de `dist`** à la racine web, puis placer `server/` à cette même racine. L'hébergement doit exécuter PHP, pas seulement servir des fichiers statiques. Vérifier aussi que les fichiers `.htaccess` sont bien transférés et appliqués. L'administration s'ouvre avec `/?admin` ; le serveur exige une session pour toute écriture. L'accès `/admin` direct dépend des règles de réécriture de l'hébergement.

Ne créez jamais un compte ou un mot de passe par défaut dans le code. La création initiale du superadmin utilise `php server/scripts/create-admin.php <nom>` depuis une console sur le serveur ; si l'hébergeur ne propose que le FTP, demander un accès CLI ou une procédure sécurisée à l'hébergeur. Faire changer le mot de passe temporaire à la première connexion. Ne pas le conserver dans Git.

**Données de production :** après installation, ne remplacez jamais `server/storage/data/`, `server/storage/private/` ou `server/uploads/` par les copies du dépôt lors d'un déploiement FTP. Les changements des administrateurs y sont enregistrés. Sauvegarder régulièrement ces dossiers, en protégeant les sauvegardes hors accès web et en testant leur restauration. Les comptes, fichiers de limitation de connexion et verrous privés sont ignorés par Git. Les images remplacées peuvent rester sur disque pour éviter une perte si l'enregistrement échoue ; leur nettoyage doit être fait séparément après sauvegarde.

Les fichiers privés doivent être bloqués par la configuration de l'hébergement. Sous Apache vérifier que `.htaccess` est actif ; sous Nginx appliquer les règles équivalentes. Bloquer l'exécution de scripts dans `uploads/`. Le serveur de développement `php -S` ignore `.htaccess` : ne pas l'exposer sur Internet ni l'utiliser pour la production. Activer HTTPS, vérifier les permissions d'écriture uniquement nécessaires à PHP, et tester les autorisations sur l'hébergement réel.

Le catalogue public ne renvoie que `PUBLISHED`. Les comptes admin peuvent demander `?includeDrafts=1` pour voir aussi brouillons et archives. Les nouveaux produits sont des brouillons par défaut. Les mises à jour JSON sont sérialisées par un verrou global ; familles, marques, catégories, types et modèles utilisés ne peuvent pas être supprimés. Tester ces règles après chaque déploiement. Une sauvegarde reste indispensable.

En développement, Vite transmet `/server` au serveur PHP local `127.0.0.1:8000` (configurable avec `FUNBIKE_PHP_TARGET` côté Vite). Le navigateur utilise toujours des URL relatives. Ne pas exposer le serveur PHP de développement et protéger séparément ses données de test.

### Migration d'une ancienne installation

Avant de renommer l'ancien dossier `serveur` en `server` sur l'hébergement, sauvegarder les données, les comptes et les images existants. Conserver le contenu de `storage/` et `uploads/` de production, sans renommer les dossiers de logos. Les URL enregistrées pour les images doivent commencer par `/server/uploads/` ; si votre installation contient encore `/serveur/uploads/`, corriger ces chemins dans une **copie sauvegardée** des JSON avant de la restaurer et de vérifier les images. Ne pas réinitialiser les données ou comptes avec les fichiers du dépôt.

L'interface admin gère les produits des quatre catégories existantes, les marques, catégories, familles, types, modèles et comptes. Les nouvelles familles et nouveaux types alimentent les filtres selon les produits publiés. Pour les motos, la famille utilisée est celle du type (`productTypeId` → type → `familyId`) : le champ texte historique `family` n'est pas la référence. Les catégories de produits restent les quatre catégories prises en charge par les routes et pages existantes : créer une catégorie supplémentaire ne crée pas automatiquement une nouvelle page ou un nouvel endpoint. L'édition des revendeurs et coordonnées reste disponible par API, mais n'a pas encore de formulaire dans l'admin.

Les tests automatisés `npm test` couvrent aussi l'API lorsque PHP est installé (sinon le test PHP est indiqué comme ignoré). Ils utilisent une copie temporaire isolée, jamais les données de production.
