<?php
declare(strict_types=1);
namespace Bibliotheque;

final class LibraryError extends \RuntimeException
{
    public function __construct(string $message, public int $status = 503, public string $kind = 'unavailable') { parent::__construct($message); }
}

function today(): string { return (new \DateTimeImmutable('now', new \DateTimeZone('Europe/Paris')))->format('Y-m-d'); }
function text(mixed $value, int $max, string $label, bool $required = true): string
{
    if (!is_string($value) || !preg_match('//u', $value) || strlen($value) > $max * 4 || preg_match('/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/', $value)) throw new LibraryError($label . ' est invalide.', 422, 'invalid_input');
    $value = trim($value);
    if (($required && $value === '') || preg_match_all('/./us', $value) > $max) throw new LibraryError($label . ' est trop long ou vide.', 422, 'invalid_input');
    return $value;
}
function date(mixed $value, ?string $now = null): string
{
    if (!is_string($value) || !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/D', $value, $m) || !checkdate((int) $m[2], (int) $m[3], (int) $m[1]) || $value < '1900-01-01' || $value > ($now ?? today())) throw new LibraryError('Choisis une date de fin existante, entre 1900 et aujourd’hui.', 422, 'invalid_input');
    return $value;
}
function id(mixed $value): string
{
    if (!is_string($value) || !preg_match('/^[a-f0-9]{32}$/D', $value)) throw new LibraryError('Ce livre n’est pas reconnu.', 422, 'invalid_input');
    return $value;
}
function revision(mixed $value): int
{
    if (!is_int($value) || $value < 1 || $value > 2147483646) throw new LibraryError('Recharge la fiche avant de réessayer.', 422, 'invalid_input');
    return $value;
}
function key(mixed $value, string $type): ?string
{
    if ($value === null || $value === '') return null;
    $pattern = $type === 'work' ? '~^/works/OL[0-9]+W$~D' : '~^/books/OL[0-9]+M$~D';
    if (!is_string($value) || strlen($value) > 50 || !preg_match($pattern, $value)) throw new LibraryError('La référence Open Library est invalide.', 422, 'invalid_input');
    return $value;
}
function coverId(mixed $value): ?int
{
    if ($value === null) return null;
    if (!is_int($value) || $value < 1 || $value > 2147483647) throw new LibraryError('La couverture est invalide.', 422, 'invalid_input');
    return $value;
}

final class Books
{
    public function __construct(private \PDO $db) {}
    private function publicBook(array $row): array
    {
        return ['id' => $row['id'], 'title' => $row['title'], 'author' => $row['author'], 'date' => $row['finished_on'], 'note' => $row['note'], 'workKey' => $row['work_key'], 'editionKey' => $row['edition_key'], 'coverId' => $row['cover_id'] === null ? null : (int) $row['cover_id'], 'revision' => (int) $row['revision']];
    }
    public function all(int $user): array
    {
        $q = $this->db->prepare('SELECT * FROM library_books WHERE user_id = ? AND deleted_at IS NULL ORDER BY finished_on DESC, created_at DESC, id');
        $q->execute([$user]); return array_map($this->publicBook(...), $q->fetchAll(\PDO::FETCH_ASSOC));
    }
    private function find(int $user, string $id, bool $deleted = false): array
    {
        $q = $this->db->prepare('SELECT * FROM library_books WHERE user_id = ? AND id = ?' . ($deleted ? '' : ' AND deleted_at IS NULL'));
        $q->execute([$user, $id]); $row = $q->fetch(\PDO::FETCH_ASSOC);
        if (!$row) throw new LibraryError('Ce livre n’est plus dans ta bibliothèque.', 404, 'not_found');
        return $row;
    }
    public function create(int $user, array $input): array
    {
        $id = id($input['id'] ?? null);
        $values = [$user, $id, text($input['title'] ?? null, 200, 'Le titre'), text($input['author'] ?? null, 200, 'Le nom de l’auteur'), date($input['date'] ?? null), text($input['note'] ?? '', 2000, 'Le souvenir', false), key($input['workKey'] ?? null, 'work'), key($input['editionKey'] ?? null, 'edition'), coverId($input['coverId'] ?? null)];
        // Une nouvelle tentative réseau utilise le même identifiant et ne crée pas de doublon.
        $sql = 'INSERT INTO library_books (user_id,id,title,author,finished_on,note,work_key,edition_key,cover_id) VALUES (?,?,?,?,?,?,?,?,?) ';
        $sql .= $this->db->getAttribute(\PDO::ATTR_DRIVER_NAME) === 'sqlite' ? 'ON CONFLICT(user_id,id) DO NOTHING' : 'ON DUPLICATE KEY UPDATE id = VALUES(id)';
        $this->db->prepare($sql)->execute($values);
        $row = $this->find($user, $id, true);
        if ($row['deleted_at'] !== null) throw new LibraryError('Ce livre a été retiré. Recommence son ajout.', 409, 'conflict');
        return $this->publicBook($row);
    }
    public function update(int $user, array $input): array
    {
        $id = id($input['id'] ?? null); $version = revision($input['revision'] ?? null);
        $previous = $this->find($user, $id);
        $edition = $previous['edition_key'];
        $cover = $previous['cover_id'];
        $title = $previous['title'];
        if (array_key_exists('editionKey', $input)) {
            $edition = key($input['editionKey'], 'edition');
            if ($edition === null || $previous['work_key'] === null) throw new LibraryError('Choisis une édition du livre.', 422, 'invalid_input');
            $cover = coverId($input['coverId'] ?? null);
            $title = text($input['title'] ?? $title, 200, 'Le titre');
        }
        $q = $this->db->prepare('UPDATE library_books SET finished_on = ?, note = ?, edition_key = ?, cover_id = ?, title = ?, revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND id = ? AND revision = ? AND deleted_at IS NULL');
        $q->execute([date($input['date'] ?? null), text($input['note'] ?? '', 2000, 'Le souvenir', false), $edition, $cover, $title, $user, $id, $version]);
        if ($q->rowCount() !== 1) throw new LibraryError('Ce livre a changé sur un autre appareil. Recharge la bibliothèque avant de réessayer.', 409, 'conflict');
        return $this->publicBook($this->find($user, $id));
    }
    public function remove(int $user, array $input): array
    {
        $id = id($input['id'] ?? null); $version = revision($input['revision'] ?? null);
        $this->find($user, $id);
        $q = $this->db->prepare('UPDATE library_books SET deleted_at = CURRENT_TIMESTAMP, revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND id = ? AND revision = ? AND deleted_at IS NULL');
        $q->execute([$user, $id, $version]);
        if ($q->rowCount() !== 1) throw new LibraryError('Ce livre a changé sur un autre appareil. Recharge la bibliothèque avant de réessayer.', 409, 'conflict');
        return $this->publicBook($this->find($user, $id, true));
    }
    public function restore(int $user, array $input): array
    {
        $id = id($input['id'] ?? null); $version = revision($input['revision'] ?? null);
        $row = $this->find($user, $id, true);
        if ($row['deleted_at'] === null) throw new LibraryError('Ce livre est déjà dans ta bibliothèque.', 409, 'conflict');
        $q = $this->db->prepare('UPDATE library_books SET deleted_at = NULL, revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND id = ? AND revision = ? AND deleted_at IS NOT NULL');
        $q->execute([$user, $id, $version]);
        if ($q->rowCount() !== 1) throw new LibraryError('Ce livre a changé sur un autre appareil. Recharge la bibliothèque.', 409, 'conflict');
        return $this->publicBook($this->find($user, $id));
    }
}

function normalizeSearch(array $data): array
{
    if (!isset($data['docs']) || !is_array($data['docs'])) throw new LibraryError('Open Library a renvoyé une réponse inattendue. Réessaie dans un instant.');
    $result = []; $seen = [];
    foreach (array_slice($data['docs'], 0, 12) as $doc) {
        if (!is_array($doc)) continue;
        try {
            $work = $doc['key'] ?? null;
            if (is_string($work) && preg_match('/^OL\d+W$/D', $work)) $work = '/works/' . $work;
            $work = key($work, 'work'); if (!$work || isset($seen[$work])) continue;
            $edition = $doc['editions']['docs'][0] ?? [];
            if (!is_array($edition)) $edition = [];
            $title = text($edition['title'] ?? $doc['title'] ?? null, 200, 'Le titre');
            $authors = array_filter(is_array($doc['author_name'] ?? null) ? $doc['author_name'] : [], 'is_string');
            $author = text(implode(', ', array_slice($authors, 0, 3)) ?: 'Auteur non renseigné', 200, 'Le nom de l’auteur');
            $editionKey = $edition['key'] ?? null;
            if (!$editionKey && is_string($doc['cover_edition_key'] ?? null)) $editionKey = '/books/' . $doc['cover_edition_key'];
            $cover = $editionKey ? ($edition['cover_i'] ?? $edition['covers'][0] ?? null) : ($doc['cover_i'] ?? null);
            if (!is_int($cover) || $cover < 1 || $cover > 2147483647) $cover = null;
            $result[] = ['workKey' => $work, 'editionKey' => key($editionKey, 'edition'), 'title' => $title, 'author' => $author, 'coverId' => $cover]; $seen[$work] = true;
        } catch (LibraryError) { continue; }
    }
    return $result;
}

function normalizeEditions(array $data, string $work, int $offset): array
{
    if (!isset($data['entries']) || !is_array($data['entries']) || !array_is_list($data['entries'])) {
        throw new LibraryError('Les éditions de ce livre n’ont pas pu être lues. Réessaie dans un instant.');
    }
    $editions = [];
    $seen = [];
    foreach (array_slice($data['entries'], 0, 30) as $entry) {
        if (!is_array($entry)) continue;
        try {
            $editionKey = key($entry['key'] ?? null, 'edition');
            if (!$editionKey || isset($seen[$editionKey])) continue;
            if (isset($entry['works']) && (!is_array($entry['works']) || !in_array($work, array_column($entry['works'], 'key'), true))) continue;
            $publishers = array_filter(is_array($entry['publishers'] ?? null) ? $entry['publishers'] : [], 'is_string');
            $languages = [];
            foreach (is_array($entry['languages'] ?? null) ? $entry['languages'] : [] as $language) {
                if (is_array($language) && is_string($language['key'] ?? null) && preg_match('~^/languages/([a-z]{2,3})$~D', $language['key'], $match)) $languages[] = $match[1];
            }
            $isbn = null;
            foreach (['isbn_13', 'isbn_10'] as $field) {
                foreach (is_array($entry[$field] ?? null) ? $entry[$field] : [] as $value) {
                    if (is_string($value) && preg_match('/^(?:\d{13}|\d{9}[0-9Xx])$/D', $value)) { $isbn = strtoupper($value); break 2; }
                }
            }
            $cover = null;
            foreach (is_array($entry['covers'] ?? null) ? $entry['covers'] : [] as $value) {
                if (is_int($value) && $value > 0 && $value <= 2147483647) { $cover = $value; break; }
            }
            $editions[] = [
                'workKey' => $work,
                'editionKey' => $editionKey,
                'title' => text($entry['title'] ?? null, 200, 'Le titre'),
                'coverId' => $cover,
                'publisher' => text(implode(', ', array_slice($publishers, 0, 2)), 400, 'L’éditeur', false),
                'publishDate' => text($entry['publish_date'] ?? '', 100, 'La date de publication', false),
                'languages' => array_values(array_unique($languages)),
                'isbn' => $isbn,
                'format' => text($entry['physical_format'] ?? '', 100, 'Le format', false),
            ];
            $seen[$editionKey] = true;
        } catch (LibraryError) { continue; }
    }
    $count = count($data['entries']);
    $total = is_int($data['size'] ?? null) && $data['size'] >= 0 ? $data['size'] : null;
    $more = $count > 0 && ($total !== null ? $offset + $count < $total : isset($data['links']['next']));
    return ['editions' => $editions, 'total' => $total, 'nextOffset' => $more ? $offset + $count : null];
}

final class Catalog
{
    private ?\Closure $transport;
    public function __construct(private string $directory, ?callable $transport = null) { $this->transport = $transport ? \Closure::fromCallable($transport) : null; }
    public function search(string $query): array
    {
        $query = text($query, 160, 'La recherche');
        if (preg_match_all('/./us', $query) < 2) throw new LibraryError('Saisis au moins deux caractères.', 422, 'invalid_input');
        $url = 'https://openlibrary.org/search.json?' . http_build_query(['q' => $query, 'lang' => 'fr', 'limit' => 12, 'fields' => 'key,title,author_name,cover_i,cover_edition_key,editions'], '', '&', PHP_QUERY_RFC3986);
        return $this->cached('fr:v2:' . strtolower($query), $url, normalizeSearch(...));
    }
    public function editions(string $work, int $offset = 0, string $group = 'all'): array
    {
        $work = key($work, 'work');
        if ($work === null || $offset < 0 || $offset > 1000000 || !in_array($group, ['all', 'fr', 'other'], true)) throw new LibraryError('La liste d’éditions est invalide.', 422, 'invalid_input');
        if ($group === 'fr') {
            $parameters = [
                'type' => '/type/edition',
                'works' => $work,
                'languages' => '/languages/fre',
                'title' => '', 'publishers' => '', 'publish_date' => '',
                'isbn_13' => '', 'isbn_10' => '', 'covers' => '', 'physical_format' => '',
                'limit' => 30, 'offset' => $offset,
            ];
            $url = 'https://openlibrary.org/query.json?' . http_build_query($parameters, '', '&', PHP_QUERY_RFC3986);
            return $this->cached('editions:fr:v1:' . $work . ':' . $offset, $url, function (array $entries) use ($work, $offset): array {
                if (!array_is_list($entries)) throw new LibraryError('Les éditions françaises n’ont pas pu être lues. Réessaie dans un instant.');
                // Le filtre porte sur /languages/fre. Ce champ n’est pas inclus dans les projections retournées.
                foreach ($entries as &$entry) {
                    if (is_array($entry)) $entry['languages'] = [['key' => '/languages/fre']];
                }
                unset($entry);
                $result = normalizeEditions(['entries' => $entries], $work, $offset);
                $moreFrench = count($entries) === 30;
                $result['nextGroup'] = $moreFrench ? 'fr' : 'other';
                $result['nextOffset'] = $moreFrench ? $offset + 30 : 0;
                return $result;
            });
        }
        $url = 'https://openlibrary.org' . $work . '/editions.json?limit=30&offset=' . $offset;
        $result = $this->cached('editions:v1:' . $work . ':' . $offset, $url, fn(array $data) => normalizeEditions($data, $work, $offset));
        if ($group === 'other') $result['nextGroup'] = $result['nextOffset'] === null ? null : 'other';
        return $result;
    }
    private function cached(string $cacheKey, string $url, callable $normalize): array
    {
        if (!is_dir($this->directory) && !@mkdir($this->directory, 0700, true) && !is_dir($this->directory)) throw new LibraryError('Le catalogue ne peut pas être ouvert pour le moment.');
        $file = $this->directory . '/' . hash('sha256', $cacheKey) . '.json';
        $cached = $this->read($file); if ($cached !== null) return $cached;
        $lock = @fopen($this->directory . '/catalog.lock', 'c+');
        if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) { if (is_resource($lock)) fclose($lock); throw new LibraryError('Une recherche est déjà en cours. Réessaie dans un instant.', 429, 'rate_limited'); }
        try {
            $cached = $this->read($file); if ($cached !== null) return $cached;
            rewind($lock); $last = (float) stream_get_contents($lock);
            $wait = 1.1 - (microtime(true) - $last);
            if ($wait > 0) usleep((int) ceil(min($wait, 1.1) * 1000000));
            ftruncate($lock, 0); rewind($lock); fwrite($lock, (string) microtime(true)); fflush($lock);
            $data = $this->transport ? ($this->transport)($url) : $this->download($url);
            if (!is_array($data)) throw new LibraryError('La recherche Open Library est momentanément indisponible.');
            $result = $normalize($data);
            $temporary = $file . '.' . bin2hex(random_bytes(5)) . '.tmp';
            if (@file_put_contents($temporary, json_encode($result, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), LOCK_EX) === false || !@rename($temporary, $file)) { @unlink($temporary); throw new LibraryError('Le catalogue ne peut pas être mis en cache pour le moment.'); }
            // Seul le catalogue public est stocké ici, jamais les lectures ou souvenirs.
            foreach (glob($this->directory . '/*.json') ?: [] as $old) if (filemtime($old) < time() - 86400) @unlink($old);
            return $result;
        } finally { flock($lock, LOCK_UN); fclose($lock); }
    }
    private function read(string $file): ?array
    {
        if (!is_file($file) || filemtime($file) < time() - 86400 || filesize($file) > 200000) return null;
        $data = json_decode((string) @file_get_contents($file), true);
        return is_array($data) ? $data : null;
    }
    private function download(string $url): array
    {
        if (!function_exists('curl_init')) throw new LibraryError('La recherche de livres nécessite l’extension cURL sur le serveur. La saisie manuelle reste disponible.');
        $curl = curl_init($url); $body = '';
        curl_setopt_array($curl, [CURLOPT_RETURNTRANSFER => false, CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_TIMEOUT => 15, CURLOPT_USERAGENT => 'MelazBibliotheque/1.0 (+https://melaz.fr)', CURLOPT_HTTPHEADER => ['Accept: application/json'], CURLOPT_WRITEFUNCTION => static function ($handle, string $chunk) use (&$body): int { if (strlen($body) + strlen($chunk) > 2097152) return 0; $body .= $chunk; return strlen($chunk); }]);
        $ok = curl_exec($curl); $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE); curl_close($curl);
        if ($status === 429) throw new LibraryError('Open Library reçoit trop de demandes. Réessaie dans quelques instants.', 429, 'rate_limited');
        if ($ok === false || $status !== 200) throw new LibraryError('Open Library est momentanément indisponible. Réessaie ou ajoute le livre manuellement.');
        try { $data = json_decode($body, true, 32, JSON_THROW_ON_ERROR); } catch (\JsonException) { throw new LibraryError('La réponse Open Library n’a pas pu être lue.'); }
        if (!is_array($data)) throw new LibraryError('La réponse Open Library n’a pas pu être lue.');
        return $data;
    }
}
