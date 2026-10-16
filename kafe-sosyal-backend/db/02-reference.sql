-- Referans veriler. Din, siyaset, cinsel yönelim gibi özel nitelikli kategoriler bilerek yok (KVKK m.6).
-- Yeni ilgi alanı eklemek için yeni bir dosya (03-...) açın; bu dosya bir kez çalışır.

INSERT INTO interests (slug, label, emoji) VALUES
    ('coffee',         'Kahve',           '☕'),
    ('cinema',         'Sinema',          '🎬'),
    ('music',          'Müzik',           '🎵'),
    ('games',          'Oyun',            '🎮'),
    ('board-games',    'Masa oyunları',   '🎲'),
    ('entrepreneurship','Girişimcilik',   '💻'),
    ('tech',           'Teknoloji',       '🖥️'),
    ('books',          'Kitap',           '📚'),
    ('sports',         'Spor',            '⚽'),
    ('running',        'Koşu',            '🏃'),
    ('fitness',        'Fitness',         '💪'),
    ('hiking',         'Doğa yürüyüşü',   '🥾'),
    ('travel',         'Seyahat',         '✈️'),
    ('art',            'Sanat',           '🎨'),
    ('photography',    'Fotoğrafçılık',   '📷'),
    ('cooking',        'Yemek yapmak',    '🍳'),
    ('languages',      'Yabancı dil',     '🗣️'),
    ('theatre',        'Tiyatro',         '🎭'),
    ('pets',           'Evcil hayvanlar', '🐾')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO intents (slug, label) VALUES
    ('coffee',     'Kahve içmek'),
    ('meet',       'Yeni insanlarla tanışmak'),
    ('networking', 'Networking'),
    ('games',      'Oyun oynamak'),
    ('study',      'Ders/çalışma arkadaşı'),
    ('dating',     'Flört/tanışma'),
    ('friends',    'Arkadaş edinmek')
ON CONFLICT (slug) DO NOTHING;
