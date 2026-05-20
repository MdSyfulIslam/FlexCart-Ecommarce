require('dotenv').config();
const { pool } = require('../config/db');

const img = () => null;

// [company_id, category_id, name, description, old_price, current_price, min_price, max_price,
//  discount_pct, stock, promo_code, image_url, points_reward, stars_reward, total_sold,
//  brand, model, color, warranty, rating, tag]
const products = [
  // ── TechHub Electronics (company 1) ─────────────────────────────
  [1,1,'Samsung 65" QLED 4K Smart TV','Crystal-clear QLED display with 4K resolution, HDR10+ support and built-in streaming apps.',1499.99,1199.99,900,1500,15,8,null,img('Samsung QLED TV'),100,0.18,30,'Samsung','QN65Q80B','Obsidian Black','2 Years',4.6,'TV'],
  [1,1,'iPhone 15 Pro 256GB','Apple iPhone 15 Pro with A17 Pro chip, titanium design, 48MP camera system and Dynamic Island.',1199.99,999.99,850,1200,17,50,null,img('iPhone 15 Pro'),200,0.20,80,'Apple','iPhone 15 Pro','Natural Titanium','1 Year',4.8,'Smartphone'],
  [1,1,'Sony WH-1000XM5 Headphones','Industry-leading noise cancellation, 30-hour battery, crystal-clear hands-free calling.',449.99,329.99,250,450,27,30,null,img('Sony Headphones'),50,0.15,45,'Sony','WH-1000XM5','Midnight Black','1 Year',4.7,'Headphones'],
  [1,1,'Dell XPS 15 Laptop','15.6" OLED display, Intel Core i7-13700H, 32GB RAM, 1TB SSD, NVIDIA RTX 4060.',1899.99,1599.99,1300,1900,16,20,null,img('Dell XPS 15 Laptop'),120,0.12,25,'Dell','XPS 15 9530','Platinum Silver','1 Year',4.5,'Laptop'],
  [1,1,'Canon EOS R50 Mirrorless Camera','24.2MP APS-C sensor, 4K video, dual-pixel autofocus, ideal for creators and beginners.',799.99,649.99,550,800,19,15,null,img('Canon Mirrorless Camera'),80,0.14,20,'Canon','EOS R50','White','1 Year',4.6,'Camera'],
  [1,1,'Apple iPad Air 5th Gen 64GB','M1 chip, 10.9" Liquid Retina display, 5G capable, 12MP front camera for video calls.',749.99,599.99,500,750,20,35,null,img('iPad Air'),90,0.16,40,'Apple','iPad Air 5','Space Gray','1 Year',4.7,'Tablet'],
  [1,1,'Logitech MX Master 3S Mouse','Advanced wireless mouse, 8K DPI sensor, quiet clicks, customizable buttons, ultra-fast scrolling.',99.99,79.99,60,100,20,60,'WELCOME10',img('Wireless Mouse'),25,0.08,120,'Logitech','MX Master 3S','Graphite','2 Years',4.8,'Mouse'],
  [1,1,'Samsung 970 EVO Plus 1TB SSD','NVMe M.2 SSD, up to 3500 MB/s read speed, perfect for gaming and professional workloads.',159.99,119.99,90,160,25,40,null,img('1TB NVMe SSD'),30,0.05,95,'Samsung','970 EVO Plus','Black','5 Years',4.7,'Storage'],

  [1,1,'MacBook Air 13" (M3) 256GB','Superlight laptop with Apple M3 chip, 13.6" Liquid Retina, all-day battery and fast SSD.',1299.99,1099.99,900,1300,15,25,null,img('MacBook Air M3'),150,0.18,35,'Apple','MacBook Air M3','Midnight','1 Year',4.8,'Laptop'],
  [1,1,'Samsung Galaxy S24 128GB','Flagship smartphone with bright AMOLED display, pro camera features, and long battery life.',999.99,849.99,700,1000,15,40,null,img('Galaxy S24'),160,0.18,55,'Samsung','Galaxy S24','Onyx Black','1 Year',4.7,'Smartphone'],
  [1,1,'PlayStation 5 Console','Ultra-high speed SSD, ray tracing support, and immersive 4K gaming performance.',599.99,499.99,450,600,17,18,null,img('PlayStation 5'),120,0.16,75,'Sony','PS5','White','1 Year',4.8,'Gaming'],
  [1,1,'Bose SoundLink Flex Speaker','Portable Bluetooth speaker with deep bass, rugged build, and water resistance.',169.99,129.99,100,170,24,60,null,img('Bluetooth Speaker'),35,0.10,140,'Bose','SoundLink Flex','Black','1 Year',4.6,'Speaker'],
  [1,1,'GoPro HERO12 Black Action Camera','5.3K video, HyperSmooth stabilization, waterproof design, and creator-friendly modes.',449.99,379.99,300,450,16,22,null,img('Action Camera'),70,0.12,65,'GoPro','HERO12 Black','Black','1 Year',4.6,'Camera'],
  [1,1,'Amazon Kindle Paperwhite 16GB','Glare-free e-reader with adjustable warm light, waterproof design and weeks of battery.',179.99,149.99,120,180,17,45,null,img('Kindle Paperwhite'),40,0.09,120,'Amazon','Paperwhite','Black','1 Year',4.7,'E-Reader'],
  [1,1,'Anker PowerCore 20000mAh Power Bank','High-capacity portable charger with fast charging support and multiple ports.',79.99,59.99,45,80,25,90,'POWER5',img('Power Bank'),20,0.06,210,'Anker','PowerCore 20K','Black','18 Months',4.6,'Accessories'],

  // ── Fashion World (company 2) ────────────────────────────────────
  [2,2,'Classic Slim Fit Jeans','Premium denim slim fit jeans, 98% cotton, available in multiple washes for all-day comfort.',89.99,59.99,40,90,33,80,null,img('Slim Fit Jeans'),15,0.05,200,'Levis','511 Slim','Dark Indigo','N/A',4.4,'Jeans'],
  [2,2,'Floral Midi Dress','Elegant floral print midi dress, lightweight fabric, perfect for summer occasions and parties.',79.99,49.99,35,80,38,60,null,img('Floral Midi Dress'),10,0.04,150,'Zara',null,'Floral Multi','N/A',4.5,'Dress'],
  [2,2,'Unisex Oversized Hoodie','Cozy heavyweight cotton hoodie, relaxed fit, available in 8 colors with a kangaroo pocket.',59.99,39.99,28,60,33,100,'SAVE20',img('Oversized Hoodie'),8,0.03,300,'H&M',null,'Charcoal Gray','N/A',4.6,'Hoodie'],
  [2,2,'Nike Air Max 270 Sneakers','Iconic Nike Air cushioning, breathable mesh upper, lightweight and responsive for all-day wear.',150.00,119.99,90,150,20,45,null,img('Nike Sneakers'),20,0.06,180,'Nike','Air Max 270','White/Black','N/A',4.7,'Sneakers'],
  [2,2,'High-Waist Yoga Leggings','Compression leggings, 4-way stretch fabric, moisture-wicking, squat-proof, all-day comfort.',55.00,34.99,25,55,36,70,null,img('Yoga Leggings'),8,0.03,250,'Gymshark',null,'Sand Beige','N/A',4.5,'Leggings'],
  [2,2,"Oxford Button-Down Shirt","100% cotton twill, classic fit, button-down collar, ideal for office or smart casual wear.",45.00,29.99,20,45,33,90,null,img('Button-Down Shirt'),5,0.03,175,'M&S',null,'Sky Blue','N/A',4.3,'Shirt'],
  [2,6,'MAC Studio Fix Foundation','Full coverage powder foundation, SPF 15, matte finish, long-lasting up to 12 hours.',45.00,36.00,25,45,20,25,null,img('Foundation Makeup'),8,0.03,90,'MAC','Studio Fix NW25','NW25','N/A',4.4,'Foundation'],

  [2,2,'Aviator Polarized Sunglasses','Classic aviator sunglasses with polarized UV400 lenses and lightweight metal frame.',59.99,39.99,25,60,33,70,null,img('Aviator Sunglasses'),8,0.03,110,'Ray-Ban','Aviator Classic','Gold/Green','N/A',4.5,'Sunglasses'],
  [2,2,'Genuine Leather Wallet','Compact bifold wallet with multiple card slots, RFID blocking, and premium leather feel.',49.99,29.99,20,50,40,120,null,img('Leather Wallet'),6,0.02,260,'Fossil',null,'Brown','N/A',4.4,'Wallet'],
  [2,2,'Water-Resistant Windbreaker Jacket','Lightweight windbreaker with breathable lining, adjustable hood and zip pockets.',89.99,64.99,45,90,28,65,null,img('Windbreaker Jacket'),10,0.04,140,'Nike',null,'Black','N/A',4.5,'Jacket'],
  [2,6,'Vitamin C Brightening Serum','Daily facial serum with Vitamin C and hyaluronic acid for brighter, smoother-looking skin.',29.99,19.99,12,30,33,80,'GLOW10',img('Vitamin C Serum'),6,0.02,170,'The Ordinary',null,'N/A','N/A',4.6,'Skincare'],

  // ── HomeStyle Store (company 3) ──────────────────────────────────
  [3,3,'Instant Pot Duo 7-in-1 6Qt','7-in-1 pressure cooker, slow cooker, rice cooker, steamer, sauté pan, yogurt maker and warmer.',99.99,79.99,60,100,20,40,null,img('Instant Pot Cooker'),25,0.07,220,'Instant Pot','Duo 7-in-1','Stainless','1 Year',4.8,'Cooker'],
  [3,3,'Dyson V15 Detect Cordless Vacuum','Laser detects hidden dust, LCD screen shows live particle count, 60-min battery, powerful suction.',749.99,599.99,500,750,20,10,null,img('Cordless Vacuum'),80,0.15,55,'Dyson','V15 Detect','Yellow/Iron','2 Years',4.9,'Vacuum'],
  [3,3,'Ninja Professional Blender 1000W','1000W motor, 72oz pitcher, XL personal cups, Total Crushing Technology for smooth blends.',79.99,59.99,45,80,25,55,'FLAT5',img('Kitchen Blender'),20,0.05,160,'Ninja','BL610','Black','1 Year',4.6,'Blender'],
  [3,3,'Nespresso Vertuo Pop Machine','Vertuo technology, 5 cup sizes, 30-second heat-up time, centrifusion extraction, starter kit.',119.99,89.99,70,120,25,30,null,img('Coffee Machine'),18,0.06,130,'Nespresso','Vertuo Pop','Black','2 Years',4.7,'Coffee Machine'],
  [3,10,'L-Shaped Corner Sofa Set','5-seater L-shaped sectional sofa, premium velvet upholstery, solid wood frame with storage ottoman.',1299.99,999.99,800,1300,23,5,null,img('Corner Sofa'),120,0.20,18,'IKEA','SODERHAMN','Midnight Blue','1 Year',4.5,'Sofa'],
  [3,10,'Scandinavian Solid Wood Dining Table','6-person extending dining table, solid oak wood, minimalist Scandi design, easy self-assembly.',649.99,499.99,400,650,23,8,null,img('Dining Table'),70,0.15,22,'IKEA','MORBYLÄNGA','Oak Veneer','1 Year',4.6,'Dining Table'],
  [3,10,'Ergonomic Mesh Office Chair','Adjustable lumbar support, 3D armrests, breathable mesh back, 150kg capacity, 5-year warranty.',299.99,229.99,180,300,23,15,null,img('Office Chair'),35,0.10,75,'Herman Miller','Aeron','Graphite','5 Years',4.7,'Chair'],
  [3,5,'Adidas Ultraboost 22 Running Shoes','Responsive Boost midsole, Primeknit upper, Continental rubber outsole, dual-density heel support.',180.00,139.99,110,180,22,30,null,img('Running Shoes'),22,0.07,140,'Adidas','Ultraboost 22','Core Black','N/A',4.8,'Running Shoes'],
  [3,5,'Bowflex SelectTech 552 Dumbbells','Adjustable 5-52.5 lbs per dumbbell, replaces 15 sets of weights, fast weight selection dial.',429.99,349.99,280,430,19,6,'FLEXFIRST',img('Adjustable Dumbbells'),40,0.12,30,'Bowflex','SelectTech 552','Black/Gray','2 Years',4.7,'Dumbbells'],
  [3,9,'Fitbit Charge 6 Fitness Tracker','24/7 heart rate, SpO2 blood oxygen, sleep tracking, built-in GPS, 7-day battery life.',159.99,129.99,100,160,19,20,null,img('Fitness Tracker'),18,0.07,85,'Fitbit','Charge 6','Black','1 Year',4.6,'Fitness Tracker'],
  [3,4,'Atomic Habits by James Clear','A proven framework for improving every day. #1 New York Times bestseller, 320 pages.',24.99,14.99,10,25,40,0,null,img('Atomic Habits (Book)'),5,0.01,500,'Penguin Books',null,'Paperback','N/A',4.9,'Self Help'],
  [3,7,'LEGO Technic Lamborghini Sian','3696 pieces, 1:8 scale supercar replica, working engine and gearbox, for ages 18+.',449.99,379.99,300,450,16,5,null,img('LEGO Technic Car'),50,0.12,28,'LEGO','Technic 42115','Multi','N/A',4.9,'LEGO'],
  [3,8,'NOCO Boost Plus GB40 Jump Starter','1000A peak current, 12V lithium jump starter, USB-C charging, LED flashlight, 20 jump starts.',99.99,79.99,60,100,20,0,null,img('Car Jump Starter'),12,0.04,65,'NOCO','GB40','Blue/Black','3 Years',4.8,'Jump Starter'],

  [3,3,'COSORI 5.8QT Air Fryer','Fast air-frying with 9 presets, dishwasher-safe basket, and crispy results with less oil.',129.99,99.99,75,130,23,30,null,img('Air Fryer'),25,0.07,140,'COSORI','CP158-AF','Black','1 Year',4.7,'Kitchen'],
  [3,3,'Non-Stick Cookware Set (10-Piece)','Durable non-stick coating, even heating, and comfortable handles for everyday cooking.',199.99,149.99,120,200,25,20,null,img('Cookware Set'),30,0.08,95,'T-fal',null,'Black','1 Year',4.5,'Cookware'],
  [3,10,'Modern Coffee Table','Minimalist coffee table with sturdy frame and easy-to-clean surface for living rooms.',249.99,189.99,150,250,24,12,null,img('Coffee Table'),25,0.08,60,'IKEA',null,'Walnut','1 Year',4.4,'Table'],
  [3,4,'Clean Code by Robert C. Martin','A handbook of agile software craftsmanship—practical guidelines for writing clean, maintainable code.',44.99,34.99,25,45,22,0,null,img('Clean Code (Book)'),8,0.02,420,'Prentice Hall',null,'Paperback','N/A',4.8,'Programming'],
  [3,7,'Family Board Game Set','Easy-to-learn board game for family nights, includes cards and dice, 2–6 players.',39.99,24.99,18,40,38,25,null,img('Board Game'),10,0.03,210,'Hasbro',null,'Multi','N/A',4.6,'Game'],
  [3,8,'1080p Dash Cam with Night Vision','Wide-angle car dash camera with loop recording, G-sensor, and night vision support.',89.99,69.99,50,90,22,18,null,img('Dash Cam'),12,0.04,130,'70mai',null,'Black','1 Year',4.5,'Car Electronics'],
];

const run = async () => {
  let inserted = 0;
  let skipped = 0;
  for (const [cid, catid, name, desc, oldP, curP, minP, maxP, disc, stock, promo, imageUrl,
    pointsR, starsR, sold, brand, model, color, warranty, rating, tag] of products) {
    const [existing] = await pool.query(
      `SELECT id FROM products WHERE company_id = ? AND name = ? LIMIT 1`,
      [cid, name]
    );
    if (existing.length) {
      skipped++;
      process.stdout.write(`\r  Skipped ${skipped} (already exists): ${name.substring(0, 40)}   `);
      continue;
    }

    const images = null;
    const tags = JSON.stringify([tag, brand].filter(Boolean));
    const totalRatings = Math.floor(Math.random() * 80) + 10;

    await pool.query(
      `INSERT INTO products
        (company_id, category_id, name, description, old_price, current_price, min_price, max_price,
         discount_percentage, stock_quantity, is_in_stock, promo_code, image_url, images,
         points_reward, stars_reward, total_sold, brand, model, color, warranty,
         rating, total_ratings, tags, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,\"active\")`,
      [cid, catid, name, desc, oldP, curP, minP, maxP, disc,
       stock, stock > 0 ? 1 : 0, promo || null, imageUrl, images,
       pointsR, starsR, sold, brand || null, model || null, color || null, warranty || null,
       rating, totalRatings, tags]
    );
    inserted++;
    process.stdout.write(`\r  Inserted ${inserted}/${products.length}: ${name.substring(0, 40)}`);
  }
  console.log(`\nDone! Inserted ${inserted} products. Skipped ${skipped} existing.`);

  // Update company stats
  await pool.query(`
    UPDATE companies c SET
      total_sales = (SELECT COALESCE(SUM(total_sold),0) FROM products WHERE company_id = c.id),
      total_revenue = (SELECT COALESCE(SUM(total_sold * current_price),0) FROM products WHERE company_id = c.id),
      rating = (SELECT COALESCE(AVG(rating),0) FROM products WHERE company_id = c.id)
    WHERE id IN (1,2,3)
  `);
  console.log('Company stats updated.');
  process.exit(0);
};

run().catch(e => { console.error('\nError:', e.message); process.exit(1); });
