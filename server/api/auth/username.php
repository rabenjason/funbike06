<?php
require_once dirname(__DIR__) . '/_lib/auth.php';
funbikeBootstrapApi();
if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'PUT') funbikeJsonResponse(405, ['message' => 'Méthode non autorisée.']);
funbikeRequireTrustedOrigin();
$current = funbikeRequireSuperAdmin();
$body = funbikeReadJsonBody();
$password = $body['currentPassword'] ?? null;
if (!is_string($password) || !password_verify($password, $current['passwordHash'] ?? '')) funbikeJsonResponse(403, ['code' => 'INVALID_PASSWORD', 'message' => 'Mot de passe du superadmin incorrect.']);
$id = $body['id'] ?? null;
if (!is_string($id) || $id === '') funbikeJsonResponse(400, ['message' => 'Identifiant du compte manquant.']);
if (!is_string($body['username'] ?? null)) funbikeJsonResponse(400, ['message' => 'Nom d’utilisateur invalide.']);
try {
    $store = new FunbikeUserStore();
    $updated = $store->renameUserById($id, $body['username']);
    if (!$updated) funbikeJsonResponse(404, ['message' => 'Utilisateur introuvable.']);
    // Conserver la session qui vient de confirmer son propre mot de passe ;
    // toutes les autres sessions du compte renommé deviennent invalides.
    if ($updated['id'] === $current['id']) $_SESSION['auth_version'] = (int) $updated['authVersion'];
    funbikeJsonResponse(200, ['user' => funbikeManagedUser($updated), 'message' => 'Nom d’utilisateur modifié.']);
} catch (FunbikeDuplicateUsernameException $error) {
    funbikeJsonResponse(409, ['code' => 'USERNAME_EXISTS', 'message' => $error->getMessage()]);
} catch (InvalidArgumentException $error) {
    funbikeJsonResponse(400, ['code' => 'INVALID_USERNAME', 'message' => $error->getMessage()]);
} catch (Throwable $error) {
    error_log('FUNBIKE username: ' . $error->getMessage());
    funbikeJsonResponse(500, ['message' => 'Impossible de modifier le nom d’utilisateur.']);
}
