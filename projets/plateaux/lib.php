<?php
declare(strict_types=1);
namespace Plateaux;

final class TaskError extends \RuntimeException
{
    public function __construct(string $message, public int $status = 503, public string $kind = 'unavailable') { parent::__construct($message); }
}
function id(mixed $value): string
{
    if (!is_string($value) || !preg_match('/^[a-f0-9]{32}$/D', $value)) throw new TaskError('Cette tâche est invalide.', 422, 'invalid_input');
    return $value;
}
function title(mixed $value): string
{
    if (!is_string($value) || strlen($value) > 640 || !preg_match('//u', $value) || preg_match('/[\x00-\x1f\x7f]/', $value)) throw new TaskError('Saisis une tâche de 160 caractères maximum, sur une seule ligne.', 422, 'invalid_input');
    $value = trim($value);
    if ($value === '' || preg_match('/^\s*$/u', $value) || preg_match_all('/./us', $value) > 160) throw new TaskError('Saisis une tâche de 160 caractères maximum.', 422, 'invalid_input');
    return $value;
}
function priority(mixed $value): string
{
    if (!is_string($value) || !in_array($value, ['high', 'normal', 'low'], true)) throw new TaskError('Choisis une des trois priorités.', 422, 'invalid_input');
    return $value;
}
function revision(mixed $value): int
{
    if (!is_int($value) || $value < 1 || $value > 2147483646) throw new TaskError('Recharge les tâches avant de réessayer.', 422, 'invalid_input');
    return $value;
}
function done(mixed $value): bool
{
    if (!is_bool($value)) throw new TaskError('L’état de la tâche est invalide.', 422, 'invalid_input');
    return $value;
}
function listName(mixed $value, bool $default = false): string
{
    if (!is_string($value) || strlen($value) > 168 || !preg_match('//u', $value) || preg_match('/[\x00-\x1f\x7f]/', $value)) {
        throw new TaskError('Saisis un nom de liste de 42 caractères maximum, sur une seule ligne.', 422, 'invalid_input');
    }
    $value = preg_replace('/^\s+|\s+$/u', '', $value);
    if ($value === '' || preg_match_all('/./us', $value) > 42) throw new TaskError('Saisis un nom de liste de 42 caractères maximum.', 422, 'invalid_input');
    if (preg_match('/^toutes les tâches$/iu', $value) || (!$default && strcasecmp($value, 'Rappels') === 0)) throw new TaskError('Ce nom de liste est déjà utilisé.', 409, 'list_name_taken');
    return $value;
}
final class Tasks
{
    // Le nom de la liste par défaut utilise la table existante. Ses tâches gardent list_id = NULL.
    private const DEFAULT_LIST_ROW = '00000000000000000000000000000000';

    public function __construct(private \PDO $db) {}
    private function publicTask(array $row): array
    {
        return ['id' => $row['id'], 'title' => $row['title'], 'priority' => $row['priority'], 'done' => (bool) $row['completed'], 'revision' => (int) $row['revision'], 'createdAt' => $row['created_at'], 'listId' => $row['list_id']];
    }
    public function listCatalog(int $user): array
    {
        $query = $this->db->prepare('SELECT id, name FROM todo_lists WHERE user_id = ? ORDER BY created_at ASC, id ASC');
        $query->execute([$user]);
        $lists = [];
        $defaultListName = 'Rappels';
        foreach ($query->fetchAll(\PDO::FETCH_ASSOC) as $list) {
            if ($list['id'] === self::DEFAULT_LIST_ROW) $defaultListName = $list['name'];
            else $lists[] = $list;
        }
        return ['lists' => $lists, 'defaultListName' => $defaultListName];
    }
    public function createList(int $user, array $input): array
    {
        $id = id($input['id'] ?? null);
        if ($id === self::DEFAULT_LIST_ROW) throw new TaskError('Cette liste est invalide.', 422, 'invalid_input');
        $name = listName($input['name'] ?? null);
        $sql = 'INSERT INTO todo_lists (user_id, id, name) VALUES (?, ?, ?) ';
        $sql .= $this->db->getAttribute(\PDO::ATTR_DRIVER_NAME) === 'sqlite' ? 'ON CONFLICT DO NOTHING' : 'ON DUPLICATE KEY UPDATE id = todo_lists.id';
        $this->db->prepare($sql)->execute([$user, $id, $name]);
        $list = $this->findList($user, $id);
        if (!$list) throw new TaskError('Une liste porte déjà ce nom.', 409, 'list_name_taken');
        return $list;
    }
    public function renameList(int $user, array $input): array
    {
        $default = ($input['id'] ?? null) === 'rappels';
        $id = $default ? self::DEFAULT_LIST_ROW : id($input['id'] ?? null);
        if (!$default && $id === self::DEFAULT_LIST_ROW) throw new TaskError('Cette liste est invalide.', 422, 'invalid_input');
        $current = $this->findList($user, $id);
        if (!$current && !$default) throw new TaskError('Cette liste n’est plus disponible.', 404, 'not_found');

        $name = listName($input['name'] ?? null, $default);
        $original = $current['name'] ?? 'Rappels';
        $result = ['id' => $default ? 'rappels' : $id, 'name' => $name];
        if ($name === $original) return $result;
        $conflict = new TaskError('Cette liste a changé sur un autre appareil. Vérifie son nom avant de réessayer.', 409, 'conflict');
        if (($input['previousName'] ?? null) !== $original) throw $conflict;

        try {
            if (!$current) {
                $this->db->prepare('INSERT INTO todo_lists (user_id, id, name) VALUES (?, ?, ?)')->execute([$user, $id, $name]);
                return $result;
            }
            $type = $this->db->getAttribute(\PDO::ATTR_DRIVER_NAME) === 'sqlite' ? 'BLOB' : 'BINARY';
            $query = $this->db->prepare("UPDATE todo_lists SET name = ? WHERE user_id = ? AND id = ? AND CAST(name AS $type) = CAST(? AS $type)");
            $query->execute([$name, $user, $id, $original]);
            if ($query->rowCount() === 1) return $result;
        } catch (\PDOException $error) {
            if ($error->getCode() !== '23000' || !in_array((int) ($error->errorInfo[1] ?? 0), [19, 1062, 2067], true)) throw $error;
            $latest = $this->findList($user, $id)['name'] ?? $original;
            if ($latest === $name) return $result;
            if ($latest !== $original) throw $conflict;
            throw new TaskError('Une liste porte déjà ce nom.', 409, 'list_name_taken');
        }
        if (($this->findList($user, $id)['name'] ?? null) === $name) return $result;
        throw $conflict;
    }
    private function findList(int $user, string $id): array|false
    {
        $query = $this->db->prepare('SELECT id, name FROM todo_lists WHERE user_id = ? AND id = ?');
        $query->execute([$user, $id]);
        return $query->fetch(\PDO::FETCH_ASSOC);
    }
    private function listId(int $user, mixed $value): ?string
    {
        if ($value === null) return null;
        $id = id($value);
        if ($id === self::DEFAULT_LIST_ROW || !$this->findList($user, $id)) throw new TaskError('Cette liste n’est plus disponible.', 404, 'not_found');
        return $id;
    }
    public function all(int $user): array
    {
        $query = $this->db->prepare('SELECT id, title, priority, completed, revision, created_at, list_id FROM todo_tasks WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at ASC, id ASC');
        $query->execute([$user]);
        return array_map($this->publicTask(...), $query->fetchAll(\PDO::FETCH_ASSOC));
    }
    private function find(int $user, string $id, bool $includeDeleted = false): array
    {
        $query = $this->db->prepare('SELECT * FROM todo_tasks WHERE user_id = ? AND id = ?' . ($includeDeleted ? '' : ' AND deleted_at IS NULL'));
        $query->execute([$user, $id]);
        $row = $query->fetch(\PDO::FETCH_ASSOC);
        if (!$row) throw new TaskError('Cette tâche n’est plus disponible.', 404, 'not_found');
        return $row;
    }
    public function create(int $user, array $input): array
    {
        $id = id($input['id'] ?? null);
        $values = [$user, $id, title($input['title'] ?? null), priority($input['priority'] ?? 'high'), $this->listId($user, $input['listId'] ?? null)];
        // Réutiliser le même identifiant après une coupure ne crée pas un doublon.
        $sql = 'INSERT INTO todo_tasks (user_id, id, title, priority, list_id) VALUES (?, ?, ?, ?, ?) ';
        $sql .= $this->db->getAttribute(\PDO::ATTR_DRIVER_NAME) === 'sqlite' ? 'ON CONFLICT(user_id, id) DO NOTHING' : 'ON DUPLICATE KEY UPDATE id = VALUES(id)';
        $this->db->prepare($sql)->execute($values);
        $row = $this->find($user, $id, true);
        if ($row['deleted_at'] !== null) throw new TaskError('Cette tâche a déjà été supprimée. Recharge les tâches avant de recommencer.', 409, 'conflict');
        return $this->publicTask($row);
    }
    public function update(int $user, array $input): array
    {
        $id = id($input['id'] ?? null);
        $version = revision($input['revision'] ?? null);
        $previous = $this->find($user, $id);
        if (array_key_exists('listId', $input)) throw new TaskError('La liste d’une tâche est définie à sa création.', 422, 'invalid_input');
        $priority = array_key_exists('priority', $input) ? priority($input['priority']) : $previous['priority'];
        $completed = array_key_exists('done', $input) ? done($input['done']) : (bool) $previous['completed'];
        $query = $this->db->prepare('UPDATE todo_tasks SET priority = ?, completed = ?, revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND id = ? AND revision = ? AND deleted_at IS NULL');
        $query->execute([$priority, (int) $completed, $user, $id, $version]);
        if ($query->rowCount() !== 1) throw new TaskError('Cette tâche a changé sur un autre appareil. La liste a été actualisée ; réessaie ton action.', 409, 'conflict');
        return $this->publicTask($this->find($user, $id));
    }
    public function remove(int $user, array $input): array
    {
        $id = id($input['id'] ?? null);
        $version = revision($input['revision'] ?? null);
        $this->find($user, $id);
        $query = $this->db->prepare('UPDATE todo_tasks SET deleted_at = CURRENT_TIMESTAMP, revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND id = ? AND revision = ? AND deleted_at IS NULL');
        $query->execute([$user, $id, $version]);
        if ($query->rowCount() !== 1) throw new TaskError('Cette tâche a changé sur un autre appareil. Recharge les tâches avant de réessayer.', 409, 'conflict');
        return $this->publicTask($this->find($user, $id, true));
    }
}
