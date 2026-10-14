-- Importer une seule fois dans la base MySQL / MariaDB choisie.
CREATE TABLE IF NOT EXISTS tempo_sport_days (
    user_id BIGINT UNSIGNED NOT NULL,
    sport_date DATE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, sport_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Un jour enregistré = un jour de sport. Décocher supprime cette date.
-- user_id = 1 pour le propriétaire actuel ; futur login du hub : identifiant côté serveur.
