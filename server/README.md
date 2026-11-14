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

### Revendeurs et coordonnées depuis l’administration

Les onglets **Revendeurs** et **Contact** permettent de gérer les données de `server/storage/data/dealers.json` et `contacts.json`, sans modifier les fichiers à la main. Seuls les admins connectés peuvent enregistrer ou supprimer ; la lecture publique reste disponible pour le site. Les données existantes, y compris les fiches de démonstration, ne sont pas modifiées automatiquement.

Pour les horaires, saisir une ligne par groupe de jours : l’aperçu de l’administration et le site conservent les retours à la ligne. Pour les revendeurs, la latitude et la longitude sont nécessaires pour la carte. Les changements sont visibles sur le site lors de son prochain chargement. Les liens WhatsApp et des autres réseaux sociaux ne sont affichés sur la page Contact que s’ils sont renseignés ; Facebook apparaît uniquement dans le pied de page. Le formulaire de demande reste un lien vers la messagerie du visiteur : il ne stocke pas les messages.

## 12. Déploiement FTP et précautions

Depuis la racine du site, le dossier dans le dépôt s'appelle maintenant `server` et les URL commencent par `/server/`. Le build Vite crée `dist/index.html` : envoyer **le contenu de `dist`** à la racine web, puis placer `server/` à cette même racine. L'hébergement doit exécuter PHP, pas seulement servir des fichiers statiques. Vérifier aussi que les fichiers `.htaccess` sont bien transférés et appliqués. L'administration s'ouvre avec `/?admin` ; le serveur exige une session pour toute écriture. L'accès `/admin` direct dépend des règles de réécriture de l'hébergement.

Le logo du site et l’icône de l’onglet utilisent le fichier public `server/public/assets/company/logo-funbike.png`. Conserver ce fichier à cet emplacement lors du transfert FTP.

Ne créez jamais un compte ou un mot de passe par défaut dans le code. La création initiale du superadmin utilise `php server/scripts/create-admin.php <nom>` depuis une console sur le serveur ; si l'hébergeur ne propose que le FTP, demander un accès CLI ou une procédure sécurisée à l'hébergeur. Faire changer le mot de passe temporaire à la première connexion. Ne pas le conserver dans Git.

**Données de production :** après installation, ne remplacez jamais `server/storage/data/`, `server/storage/private/` ou `server/uploads/` par les copies du dépôt lors d'un déploiement FTP. Les changements des administrateurs y sont enregistrés. Sauvegarder régulièrement ces dossiers, en protégeant les sauvegardes hors accès web et en testant leur restauration. Les comptes, fichiers de limitation de connexion et verrous privés sont ignorés par Git. Les images remplacées peuvent rester sur disque pour éviter une perte si l'enregistrement échoue ; leur nettoyage doit être fait séparément après sauvegarde.

Les fichiers privés doivent être bloqués par la configuration de l'hébergement. Sous Apache vérifier que `.htaccess` est actif ; sous Nginx appliquer les règles équivalentes. Bloquer l'exécution de scripts dans `uploads/`. Le serveur de développement `php -S` ignore `.htaccess` : ne pas l'exposer sur Internet ni l'utiliser pour la production. Activer HTTPS, vérifier les permissions d'écriture uniquement nécessaires à PHP, et tester les autorisations sur l'hébergement réel.

Le catalogue public ne renvoie que `PUBLISHED`. Les comptes admin peuvent demander `?includeDrafts=1` pour voir aussi brouillons et archives. Les nouveaux produits sont des brouillons par défaut. Les mises à jour JSON sont sérialisées par un verrou global ; familles, marques, catégories, types et modèles utilisés ne peuvent pas être supprimés. Tester ces règles après chaque déploiement. Une sauvegarde reste indispensable.

En développement, Vite transmet `/server` au serveur PHP local `127.0.0.1:8000` (configurable avec `FUNBIKE_PHP_TARGET` côté Vite). Le navigateur utilise toujours des URL relatives. Ne pas exposer le serveur PHP de développement et protéger séparément ses données de test.

### Migration d'une ancienne installation

Avant de renommer l'ancien dossier `serveur` en `server` sur l'hébergement, sauvegarder les données, les comptes et les images existants. Conserver le contenu de `storage/` et `uploads/` de production, sans renommer les dossiers de logos. Les URL enregistrées pour les images doivent commencer par `/server/uploads/` ; si votre installation contient encore `/serveur/uploads/`, corriger ces chemins dans une **copie sauvegardée** des JSON avant de la restaurer et de vérifier les images. Ne pas réinitialiser les données ou comptes avec les fichiers du dépôt.

L'interface admin gère les produits des quatre catégories existantes, les marques, catégories, familles, types, modèles et comptes. Les nouvelles familles et nouveaux types alimentent les filtres selon les produits publiés. Pour les motos, la famille utilisée est celle du type (`productTypeId` → type → `familyId`) : le champ texte historique `family` n'est pas la référence. Les catégories de produits restent les quatre catégories prises en charge par les routes et pages existantes : créer une catégorie supplémentaire ne crée pas automatiquement une nouvelle page ou un nouvel endpoint. L'édition des revendeurs et coordonnées reste disponible par API, mais n'a pas encore de formulaire dans l'admin.

Les tests automatisés `npm test` couvrent aussi l'API lorsque PHP est installé (sinon le test PHP est indiqué comme ignoré). Ils utilisent une copie temporaire isolée, jamais les données de production.

### Photos dans l’administration

À l’ajout comme à la modification d’un produit, les aperçus permettent de choisir une seule photo principale parmi les photos existantes et les nouveaux fichiers. La sélection n’est enregistrée qu’après validation du formulaire. L’ancienne photo principale reste dans la galerie à moins d’être retirée explicitement. Le retrait d’une photo déjà enregistrée demande confirmation : après « Oui », la photo est retirée de la fiche immédiatement et son fichier est supprimé si les vérifications le permettent, même si le formulaire n’est pas enregistré. Si l’URL est encore référencée dans les données JSON, si le chemin est externe ou si les vérifications sont impossibles, seule la référence de la fiche est retirée et le fichier est conservé avec un avertissement. Si le fichier était déjà absent, seule la référence est retirée. La comparaison des chemins des données tient compte des séparateurs de Windows et utilise les chemins réels, afin de ne pas considérer à tort la fiche en cours comme une autre utilisation. Le serveur ne peut pas détecter les liens externes ou hors de ces données. Vérifier les sauvegardes et les autres usages avant confirmation : des copies en cache peuvent subsister. En cas d’échec de suppression du fichier après mise à jour de la fiche, un avertissement donne son chemin. Les deux opérations utilisent `server/api/products/photo.php` ; l’ancien fichier `server/api/products/photo-cleanup.php` n’est plus nécessaire. Lors du déploiement, installer le nouveau `photo.php` et le nouveau front avant de retirer l’ancien fichier, et demander aux administrateurs de recharger leur page : les anciennes sessions peuvent encore appeler cet ancien fichier. Les photos retirées avant cette modification ne sont pas effacées automatiquement. Dans la fiche produit, « Vérifier les photos retirées » liste les fichiers du dossier de ce produit qui ne sont plus référencés dans les données JSON ; après sauvegarde et confirmation, ils peuvent être supprimés définitivement. Seuls les noms générés par les API produits sont proposés ; les autres fichiers, liens symboliques, images encore référencées et cas impossibles à vérifier sont conservés. La liste et les références sont revérifiées au moment de la suppression. Les liens externes ou usages hors données JSON ne sont pas détectables ; des caches peuvent subsister. La vérification concerne uniquement le serveur auquel cette page est connectée, pas les copies sur un autre ordinateur ou serveur. Si la photo principale est retirée, en sélectionner une autre avant d’enregistrer, sauf si aucune photo ne reste.

Les tableaux du front commencent vides et sont remplis par l’API ; les fichiers JSON `server/storage/data/` restent indispensables et ne doivent pas être supprimés. Les textes de l’accueil sont administrables ; certains textes des autres pages restent dans le code du front.

### Sélections d’accueil dans l’administration

L’onglet Accueil liste tous les produits sélectionnés par section, y compris les brouillons, les archives et ceux qui dépassent les limites d’affichage du site. Utiliser « Tous les produits » pour ajouter un produit, ou « Retirer de la sélection » pour le retirer sans le supprimer du catalogue. Les modifications sont enregistrées individuellement.

L’API `PUT /server/api/homepage-selections.php` exige une session administrateur et reçoit `id`, `categoryId`, `field` et `value` (booléen). Elle modifie uniquement le champ de sélection demandé sous verrou, sans toucher aux autres données du produit. Le site public continue d’afficher uniquement les premiers produits publiés : trois nouveautés, trois motos dans chaque section moto et quatre équipements.

Dans **Accueil → Textes et liens**, l’équipe peut modifier les textes des sections de l’accueil, les usages animés, et ajouter, retirer ou réordonner les liens « Choisir son univers ». Pour chaque lien, choisir le titre, la destination, l’icône et éventuellement une marque. Les anciennes descriptions et images de ces liens ne sont plus utilisées. Les marques officielles et leurs slogans se gèrent ici, indépendamment de la case **Partenaire** ; leurs logos proviennent toujours des fiches de marques, et seules les marques publiées avec logo s’affichent. Les photos des produits se gèrent dans leurs fiches ; les photos de la bannière Sherco sont gérées dans leur onglet dédié. La description alternative du bandeau est utilisée si Sherco, Fantic ou TVS n’est pas publiée.

L’API publique `GET /server/api/homepage-content.php` fournit ces données au chargement du site ; un `PUT` authentifié avec la révision reçue les enregistre sous verrou. En cas de modification simultanée, l’API renvoie 409 pour éviter d’écraser les changements d’un autre administrateur. Le navigateur doit recharger le site pour afficher les nouveaux textes.

**Installation et sauvegarde :** déployer l’API et son fichier de valeurs initiales `server/api/_lib/homepage-defaults.json`. La copie `src/content/homepage-defaults.json` sert au front en développement et au build ; maintenir les deux fichiers identiques (vérifié par les tests). Tant que `server/storage/data/homepage.json` n’existe pas, l’API lit ces valeurs sans créer de fichier. Le premier enregistrement crée `homepage.json`, ignoré par Git : il contient les données réelles et doit être sauvegardé, jamais écrasé lors d’un déploiement. Un fichier existant invalide provoque une erreur au lieu de remplacer silencieusement les données : restaurer une sauvegarde. L’accès web direct à `server/storage/` et `server/api/_lib/` doit rester interdit.



### Messages du formulaire de contact

Les demandes sont enregistrées dans `server/storage/private/messages.json`, créé au premier envoi (aucun fichier de production n’est fourni dans le dépôt). L’accès direct à tout `server/storage/` doit être interdit par la configuration web, y compris si le serveur ne prend pas en charge `.htaccess`. Seuls les administrateurs authentifiés peuvent lire, modifier le statut ou supprimer les messages ; le formulaire public peut uniquement envoyer une nouvelle demande. L’enregistrement est protégé par un verrou et une écriture atomique. Un champ piège et une limite de 10 demandes par adresse réseau sur 10 minutes réduisent les abus sans les éliminer ; un réseau partagé ou un proxy mal configuré peut faire partager cette limite.

Sauvegardez régulièrement `server/storage/private/` de façon confidentielle, testez la restauration et ne l’écrasez jamais lors d’un déploiement FTP. Le dossier doit être accessible en écriture au serveur PHP. Les réponses par e-mail ou WhatsApp sont envoyées manuellement depuis l’application de l’administrateur ; elles ne sont ni envoyées automatiquement ni enregistrées dans le site. Aucune notification de nouvelle demande n’est envoyée automatiquement.

Dans l’administration, la pastille « Messages » compte tous les messages au statut Nouveau, indépendamment de la pagination. Le compteur est vérifié à la connexion, après un changement de statut ou une suppression, puis toutes les 30 secondes lorsque l’onglet est visible et au retour sur celui-ci. Un point d’exclamation indique que le compteur est indisponible, pas qu’il est à zéro. Le bouton « Actualiser » recharge la liste.

### Piston : assistant local du catalogue

Piston fonctionne dans le navigateur avec des règles locales : aucun abonnement ni service d'IA externe. Il reconnaît certaines formulations, mais pas toutes ; il peut demander des précisions ou renvoyer vers l'équipe. Avant chaque réponse, il recharge les données publiques depuis les API du site (11 requêtes). En cas d'échec, il indique qu'il ne peut pas vérifier les informations au lieu d'utiliser une réponse potentiellement périmée. L'historique local du chat est remis à zéro lorsque ces données changent.

Les recherches couvrent les produits et marques publiés : motos, casques, équipements et pièces. Les nouveautés sont tous les produits publiés dont la case « nouveauté » est cochée, avec pagination dans le chat ; ce choix est manuel et ne correspond pas à une date d'ajout automatique. Piston peut demander si une recherche ambiguë (par exemple « cross ») concerne une moto, un équipement ou une pièce, puis guider le client selon son usage (ville, cross, travail, route, etc.). Il peut affiner une sélection avec une marque ou une cylindrée renseignée. Les suggestions de motos s'appuient sur le type, la famille, les tags, les caractéristiques d'usage ou une description explicite renseignée ; elles ne présument pas du niveau du conducteur. Les prix, caractéristiques, coordonnées et horaires proviennent des données administrées ; le stock et les compatibilités de modèle/année doivent être confirmés par l'équipe. Renseignez précisément les fiches dans l'administration pour obtenir des résultats utiles.

## SEO, liens publics et déploiement

Les pages publiques utilisent des adresses réelles : `/`, `/catalogue`, `/motos`, `/equipements`, `/pieces-detachees`, `/revendeurs`, `/contact`, et des fiches `/motos/<id>`, `/casques/<id>`, `/equipements/<id>` ou `/pieces-detachees/<id>`. L'identifiant stable du produit constitue l'adresse ; une modification du nom ne change pas le lien. Les filtres et demandes de contact utilisent des paramètres d'URL sans créer de page canonique supplémentaire. Les liens, le retour navigateur et les aperçus n'exigent aucune saisie SEO lors de l'ajout d'un produit.

`server/seo.php` lit le catalogue sous le même verrou que l'API. Il fournit, avant JavaScript, des titres, descriptions, contenu public, balises Open Graph et données structurées à partir des produits et marques publiés. Les fiches non publiées ou dont la marque est masquée renvoient 404 ; les prix et disponibilités ne sont pas inventés. `/sitemap.xml` et `/robots.txt` sont générés à la demande : publier, modifier ou archiver un produit ne nécessite pas de reconstruire le site. Le sitemap ne contient ni brouillons ni pages privées. Le fichier robots demande de ne pas explorer `/server/api/`, `/server/storage/`, `/server/scripts/` et `/server/seo.php`, tout en laissant accessibles les images publiques sous `/server/uploads/` et `/server/public/`.

**Tester les flux en local :** démarrez votre serveur PHP habituel, puis relancez Vite avec `npm run dev`. Les adresses `http://localhost:5173/robots.txt` et `http://localhost:5173/sitemap.xml` sont transmises à `server/api/seo-feed.php`, qui ne fournit que ces deux réponses publiques en lecture seule via le même générateur `server/seo.php`. Si PHP est indisponible ou si le nouveau fichier n'est pas présent dans le serveur PHP utilisé, les flux ne fonctionnent pas. Le proxy est réservé au serveur de développement Vite ; le build et les règles Apache de production restent inchangés. La sortie conserve l'origine canonique définie côté PHP (par défaut `https://funbike.mg`) : c'est normal que les liens affichés soient ceux du domaine public. Pour utiliser des liens locaux sur une installation de test isolée uniquement, définir `FUNBIKE_SITE_ORIGIN=http://localhost:5173` dans l'environnement du serveur PHP avant son démarrage. Ne jamais exposer publiquement le serveur PHP intégré et protéger ses données de test ; il ignore `.htaccess`.

**Limites importantes :** les robots respectueux peuvent refuser de charger les API même pour exécuter JavaScript. Le HTML public reste donc visible si ce chargement échoue et n'est retiré qu'après le démarrage de l'application ; vérifier le rendu Google et les erreurs avec Search Console sur l'hébergement réel. Bloquer l'exploration n'empêche pas forcément l'indexation d'une URL déjà connue ; `robots.txt` n'est pas non plus un contrôle d'accès. Toutes les protections de `server/storage/`, `server/api/_lib/`, `server/scripts/` et `server/uploads/` restent obligatoires. La page `/admin` doit rester accessible aux robots pour qu'ils puissent lire son en-tête `X-Robots-Tag: noindex` ; son accès aux données reste protégé par l'authentification.

**Installation :** construire avec `npm run build`, installer le contenu de `dist/` à la racine web, y compris son `.htaccess` caché, et déployer `server/seo.php` avec l'API. Le build contient désormais des fichiers JavaScript et CSS versionnés dans `dist/assets/` : envoyer ces fichiers avant de remplacer `index.html`, vérifier qu'ils sont accessibles à `/assets/...`, puis installer l'HTML. Ne pas supprimer les anciens fichiers versionnés pendant la transition : des visiteurs peuvent encore avoir l'ancien HTML ou une ancienne session en cache. Sauvegarder et fusionner toute configuration existante au lieu d'écraser un `.htaccess`, et ne jamais remplacer `server/storage/`, `server/uploads/` ou les images de production. Il faut Apache, `mod_rewrite`, PHP et `AllowOverride` autorisant ces règles ; avec Nginx ou un autre hébergement, configurer des règles équivalentes et tester les protections. Si un `.htaccess` ou un ancien site existe déjà, le sauvegarder et fusionner les règles nécessaires au lieu de l'écraser sans vérification. Les URL `/server/` restent servies normalement et ne doivent jamais passer dans le routeur SEO. Le serveur PHP doit pouvoir lire `index.html` et les données et verrouiller `server/storage/private/catalog.lock`. Déployer à la racine du domaine : les chemins absolus ne prennent pas en charge une installation dans un sous-dossier.

L'origine canonique par défaut est `https://funbike.mg`. Pour un autre domaine, définir `FUNBIKE_SITE_ORIGIN` côté PHP avec l'origine complète, sans chemin ni slash final (par exemple `https://exemple.com`). Ne pas laisser un site de préproduction public indexable : le protéger par authentification. Configurer sur l'hébergement la redirection HTTPS et le choix du domaine `www` ou non-`www` ; tester que le domaine canonique réel correspond à `FUNBIKE_SITE_ORIGIN`.

**Migration de l'ancien site :** il n'est pas possible de deviner les correspondances entre anciennes URL et produits. Avant de remplacer l'ancien site, sauvegarder le site, inventorier ses URL (Search Console/sitemap), et vérifier chaque correspondance. Les correspondances fournies par défaut sont : `/catalogue-motos` → `/motos`, `/catalogue-motos/page/2` → `/motos` (la pagination de l'ancien site n'est pas conservée), `/catalogue-equipements` → `/equipements`, `/catalogue-motos/xx125-2026` → `/motos/xx-125-2026`, `/catalogue-motos/tvs-hlx-plus` → `/motos/tvs-hlx-plus` et `/catalogue-motos/tvs-apache-rtr-200-4v` → `/motos/tvs-apache-rtr-200-4v`. Les fiches produits ne redirigent que si le produit correspondant est publié. L'Apache 160 4V ne doit pas être confondue avec la 160 2V. Les redirections explicites peuvent être enregistrées dans `server/storage/data/seo-redirects.json` (fichier privé ignoré par Git, à sauvegarder et préserver) :

```json
{
  "/catalogue-motos/ancien-identifiant": "/motos/identifiant-actuel",
  "/ancienne-page": "/catalogue"
}
```

Les valeurs du fichier privé priment sur celles fournies par défaut ; une valeur `null` désactive une correspondance par défaut. Ne pas remplacer ce fichier lors du déploiement. Ne renseigner que des correspondances vérifiées. Une redirection 301 n'est envoyée que si la cible est une page connue ou une fiche actuellement publiée ; une cible externe, absente ou dépubliée n'est pas redirigée. Les nouvelles redirections de sections exigent aussi que l'hébergement route `/catalogue-motos`, `/catalogue-motos/page/2` et `/catalogue-equipements` vers `server/seo.php` : examiner le modèle `public/.htaccess`, sauvegarder et fusionner uniquement les règles nécessaires dans la configuration existante, sans l'écraser. Adapter les règles de réécriture de l'hébergement si un autre ancien chemin ne correspond pas aux routes listées dans `public/.htaccess`. Les autres anciennes URL ne sont pas migrées automatiquement. Ne jamais rediriger toutes les URL sans correspondance vers l'accueil. Conserver une sauvegarde avant tout déploiement et ne pas remplacer les données de production.

**Contrôles sur l'hébergement réel :** vérifier que les réponses HTML brutes des pages produits contiennent le bon titre, la description et `og:image`, que les liens directs et l'actualisation fonctionnent, que les fiches non publiées renvoient 404, que les anciennes URL vérifiées renvoient 301 vers la bonne page, et que `/sitemap.xml` n'affiche que les produits publics. Vérifier enfin que `/admin` renvoie `X-Robots-Tag: noindex`, que les chemins privés sont inaccessibles et que les méthodes d'administration restent protégées. Soumettre le sitemap à Google Search Console après la mise en ligne. L'indexation, l'affichage des extraits et le classement restent à la discrétion des moteurs.

### Photos locales de la bannière Sherco

L’administration **Accueil → Photos bannière Sherco** permet d’ajouter jusqu’à 40 images JPEG, PNG ou WebP (8 Mo et 30 millions de pixels maximum), d’en sélectionner une et de retirer une entrée après confirmation. La première image locale est sélectionnée automatiquement ; ajouter les suivantes ne change pas la sélection. Si la photo sélectionnée est retirée, la bannière garde son fond et ses textes mais n’affiche plus de photo tant qu’une autre n’a pas été sélectionnée. Les photos retirées et les anciens fichiers non associés à la bibliothèque sont visibles dans « Photos retirées ou retrouvées » ; seuls les noms propres à cette bannière sont recensés, sans modifier les fichiers à la lecture. Un admin peut les restaurer sans changer la photo affichée ou les supprimer définitivement après confirmation. Avant de supprimer, vérifier les sauvegardes et les autres usages : le serveur refuse la suppression si l’URL est encore référencée dans les autres fichiers JSON de `storage/data`, mais ne peut pas détecter les liens externes ou hors de ces données. Les fichiers restent publics par leur URL jusqu’à leur suppression et des copies en cache peuvent subsister. Les dossiers produits et les autres fichiers ne sont pas parcourus pour suppression. L’upload stocke l’image telle qu’envoyée : optimiser une copie avant l’envoi si nécessaire.

Pour ne pas changer le rendu d’une installation existante, l’ancienne image externe reste utilisée tant qu’aucune bibliothèque locale n’existe. Importer une image dont Funbike détient les droits pour remplacer cette dépendance. À partir du premier import, seule l’image locale sélectionnée est demandée aux visiteurs. Le catalogue privé `server/storage/data/sherco-banner.json` et les photos `server/uploads/homepage/` sont des données de production : les sauvegarder et ne jamais les remplacer par des copies du dépôt. Le catalogue est écrit atomiquement sous le verrou global ; les écritures exigent une session admin et une origine autorisée. Vérifier que l’extension PHP `fileinfo` est activée, ainsi que les limites `upload_max_filesize` et `post_max_size` (au moins 8 Mo et plus pour le multipart), les permissions d’écriture et le blocage de l’exécution de scripts dans `server/uploads/`.

Déployer ensemble `server/api/sherco-banner.php`, `server/api/_lib/sherco-banner.php` et `server/api/homepage-content.php` avec le build front. Les trois fichiers PHP et le build doivent être de la même version pour que la bibliothèque et le retour arrière soient cohérents. Les règles `server/uploads/homepage/.htaccess` proposent un cache long seulement pour les noms d’images aléatoires uniques ; `server/public/assets/company/.htaccess` fait de même pour le nouveau logo versionné. Elles nécessitent Apache `mod_headers` et `AllowOverride` approprié. Sauvegarder et fusionner toute configuration existante, vérifier l’héritage des protections de `server/uploads/.htaccess`, et ne pas remplacer les données ni appliquer ces règles aux API, à l’administration ou au HTML. Sur un autre serveur, configurer et tester des règles équivalentes. Vérifier que la nouvelle image choisie est affichée après changement et actualisation.

### Promotions

L'onglet **Promotions** permet de gérer des campagnes activées et publiées et d'y associer des fiches du catalogue, ou de créer une nouvelle fiche avec photos directement depuis la campagne. Les campagnes ne contiennent que des références aux fiches et les prix promotionnels ; elles ne réécrivent pas les produits. Les dates sont inclusives selon le fuseau `Indian/Antananarivo`. Seuls les produits et marques publiés apparaissent ; une fiche ne peut appartenir à deux campagnes activées et publiées dont les dates se chevauchent. Le prix original est un nombre entier positif d'ariary, la réduction est supérieure à zéro et admet deux décimales ; son montant est arrondi à l'ariary le plus proche. Les produits hors offre affichent « Sur devis ». Pour éviter de réutiliser un ancien tarif après recréation d'un produit avec le même identifiant, retirer la fiche des campagnes avant de la supprimer du catalogue.

Les campagnes sont enregistrées dans `server/storage/data/promotions.json` (créé au premier enregistrement), les bannières dans `server/uploads/promotions/` : ce sont des données réelles à sauvegarder et à ne jamais écraser lors d'une mise à jour. La description et la bannière restent enregistrées mais ne sont pas affichées sur la page Promotions ; elles restent accessibles via le flux public des campagnes actives. Les images téléversées ne sont pas supprimées automatiquement lorsqu'une campagne est supprimée. L'API protège les écritures par la session administrateur, l'origine autorisée et le verrou du catalogue ; le flux public ne retourne que les campagnes actives et produits visibles. Les prix et le menu sont actualisés régulièrement et au retour sur l'onglet ; en cas d'erreur réseau, les offres sont masquées. Les photos nécessitent PHP fileinfo et les permissions et limites d'envoi habituelles.

Pour que l'adresse directe `/promotions` fonctionne sur Apache, sauvegarder puis **fusionner** la règle correspondante du modèle `public/.htaccess` avec la configuration existante, sans l'écraser. Le build, `server/seo.php`, l'API des promotions et les fichiers PHP concernés doivent être de la même version ; la liste exacte des autres fichiers à mettre à jour dépend de la version déjà déployée. Avant toute intervention, identifier cette version et sauvegarder les données et photos, puis tester les règles et autorisations sur l'hébergement réel.

### Thème du site et noms d’utilisateurs

L’onglet **Thème du site** choisit le thème Funbike d’origine ou TVS Motor pour tous les visiteurs ; chaque visiteur garde son choix jour/nuit et le dashboard conserve son apparence. Le thème est lu avec les données publiques de l’accueil sans requête supplémentaire. Les pages déjà ouvertes doivent être actualisées pour voir le changement. Les administrateurs authentifiés peuvent modifier ce choix ; une révision empêche d’écraser un autre changement concurrent. En cas de réglage corrompu, le site revient temporairement au thème Funbike sans écraser le fichier ; le dashboard signale l’erreur.

Le choix est enregistré dans `server/storage/data/site-theme.json`, créé lors du premier enregistrement : le sauvegarder et ne jamais écraser `server/storage/` lors d’un déploiement. Déployer ensemble le build, `server/api/site-theme.php`, `server/api/_lib/site-theme.php` et `server/api/homepage-content.php`. Vérifier les permissions du stockage et les protections existantes. Une ancienne version du front ignore le nouveau réglage.

Dans **Administrateurs**, seul le superadmin peut renommer son compte ou un compte admin, après confirmation de son propre mot de passe. Les noms sont normalisés en minuscules, validés et uniques ; les mots de passe et rôles sont conservés. Les autres sessions du compte renommé sont révoquées ; la session courante du superadmin est maintenue lorsqu’il renomme son propre compte. Communiquer en privé le nouvel identifiant à l’administrateur concerné. Les comptes restent dans `server/storage/private/users.json` : sauvegarder ce dossier de façon confidentielle et ne jamais le remplacer au déploiement. Déployer aussi `server/api/auth/username.php` et `server/api/_lib/user-store.php`.

### Lien Facebook dans le pied de page

Dans **Contact → Réseaux sociaux**, le bouton « Ajouter Facebook » crée une entrée préremplie ; saisir l’adresse complète de la page puis enregistrer les coordonnées. Une entrée Facebook déjà présente peut être modifiée ou retirée dans la même liste. Le premier lien dont l’adresse appartient à Facebook (`facebook.com`, `fb.com` ou `fb.me`, y compris leurs sous-domaines) apparaît uniquement sous forme d’icône dans le pied de page, sous « Distributeur exclusif » ; sans adresse reconnue, aucun lien n’est inventé. Les autres réseaux et coordonnées restent inchangés. Le lien s’ouvre dans un nouvel onglet. Les pages déjà ouvertes doivent être actualisées pour voir une modification.

Les liens sont conservés dans `server/storage/data/contacts.json`, comme les autres coordonnées : sauvegarder et préserver ce fichier et tous les autres fichiers de `storage` et `uploads` lors d’un déploiement.

### Statistiques d’ouvertures et IP distinctes estimées

Le site envoie à PHP une requête par chargement public, sans cookie de suivi ni service externe ; l’administration seule n’est pas comptée. Le compteur est **activé par défaut après déploiement**. On peut le désactiver côté serveur avec `FUNBIKE_OPENINGS_ENABLED=0` et supprimer les requêtes en reconstruisant le front avec `VITE_COUNT_SITE_OPENINGS=0`. Les anciennes données `site-openings.json` et `site-audience.json` restent intactes et ne sont pas importées ; la nouvelle série commence au déploiement. Ne jamais écraser `storage` ou `uploads` pendant le déploiement.

Le serveur prend `REMOTE_ADDR` uniquement, sans accepter `X-Forwarded-For` d’un client. Il calcule une empreinte HMAC-SHA256 de l’adresse IP avec une clé aléatoire privée, renouvelée au premier événement de chaque nouvelle année. Il ne conserve pas l’adresse IP en clair dans les statistiques. Une IP n’est pas une personne : connexions partagées, changements d’adresse, IPv6, VPN, proxy ou CDN peuvent fausser les estimations ; plusieurs visiteurs derrière un proxy peuvent tous être comptés comme un seul. Faire vérifier par l’hébergeur la signification de `REMOTE_ADDR` sans activer aveuglément un en-tête client. Actualisations, robots, pannes, bloqueurs et la limite de 120 requêtes par minute influencent les ouvertures. Les visiteurs annuels sont dédupliqués entre les mois et ne doivent pas être additionnés. Aucun historique n’est reconstitué et une année peut être incomplète.

Fichiers runtime privés : `server/storage/private/site-ip-audience.json`, `site-ip-audience-key.json`, et verrou `site-ip-audience.lock`. Les empreintes sont conservées au plus 36 mois glissants et purgées à la prochaine ouverture ; sans ouverture, une purge contrôlée reste nécessaire, y compris selon la politique de sauvegardes. L’ancienne clé est remplacée lors de la première ouverture de l’année suivante ; attention aux sauvegardes qui peuvent en contenir des copies. Ne pas exposer `storage` par HTTP, vérifier la protection Apache et les permissions, et sauvegarder ces fichiers de façon confidentielle. La perte de la clé de l’année courante bloque les nouvelles écritures au lieu de compter silencieusement des doublons. Un fichier endommagé n’est pas réinitialisé.

**Protection des données :** les empreintes d’IP sont pseudonymes, pas nécessairement anonymes. Les journaux du serveur, de l’hébergeur ou du CDN peuvent conserver les IP en clair ; le code ne les contrôle pas. Avant mise en production, faire vérifier les obligations applicables, notamment l’information, les droits, la base légale, la durée de conservation et l’éventuel accès international. Ne pas considérer l’absence de cookie ou le hachage comme une garantie de conformité.
