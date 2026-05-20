-- Recompute aggregate ratings to match FlexCart rules:
-- - Product rating/total_ratings come from product_reviews
-- - Company rating/total_ratings come from company_ratings (company reviews)

-- 1) Products
UPDATE products p
SET
  p.rating = COALESCE((
    SELECT AVG(pr.rating)
    FROM product_reviews pr
    WHERE pr.product_id = p.id
  ), 0),
  p.total_ratings = COALESCE((
    SELECT COUNT(*)
    FROM product_reviews pr
    WHERE pr.product_id = p.id
  ), 0)
WHERE p.status = 'active';

-- 2) Companies
UPDATE companies c
SET
  c.rating = COALESCE((
    SELECT AVG(cr.rating)
    FROM company_ratings cr
    WHERE cr.company_id = c.id
  ), 0),
  c.total_ratings = COALESCE((
    SELECT COUNT(*)
    FROM company_ratings cr
    WHERE cr.company_id = c.id
  ), 0)
WHERE c.status = 'active';
