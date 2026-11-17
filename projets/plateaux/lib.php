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
final class Tasks
{
    public function __construct(private \PDO $db) {}
    private function publicTask(array $row): array
    {
        return ['id' => $row['id'], 'title' => $row['title'], 'priority' => $row['priority'], 'done' => (bool) $row['completed'], 'revision' => (int) $row['revision'], 'createdAt' => $row['created_at']];
    }
    public function all(int $user): array
    {
        $query = $this->db->prepare('SELECT * FROM todo_tasks WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at ASC, id ASC');
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
        $values = [$user, $id, title($input['title'] ?? null), priority($input['priority'] ?? 'high')];
        // Réutiliser le même identifiant après une coupure ne crée pas un doublon.
        $sql = 'INSERT INTO todo_tasks (user_id, id, title, priority) VALUES (?, ?, ?, ?) ';
        $sql .= $this->db->getAttribute(\PDO::ATTR_DRIVER_NAME) === 'sqlite' ? 'ON CONFLICT(user_id, id) DO NOTHING' : 'ON DUPLICATE KEY UPDATE id = VALUES(id)';
        $this->db->prepare($sql)->execute($values);
        $row = $this->find($user, $id, true);
        if ($row['deleted_at'] !== null) throw new TaskError('Cet ajout a déjà été annulé. Recharge les tâches avant de recommencer.', 409, 'conflict');
        return $this->publicTask($row);
    }
    public function update(int $user, array $input): array
    {
        $id = id($input['id'] ?? null);
        $version = revision($input['revision'] ?? null);
        $previous = $this->find($user, $id);
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
