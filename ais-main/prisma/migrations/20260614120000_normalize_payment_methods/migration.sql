UPDATE "Payment"
SET "method" = 'Наличные'
WHERE LOWER("method") IN ('cash', 'нал', 'наличные', 'наличными');

UPDATE "Payment"
SET "method" = 'Перевод'
WHERE LOWER("method") IN ('card', 'transfer', 'карта', 'картой', 'переводом', 'перевод');
