-- Auto-generated seed from 1mg SHEET.xlsx

-- Run migration first
-- Add detailed product columns from the 1mg product sheet

ALTER TABLE products ADD COLUMN IF NOT EXISTS brand_name VARCHAR(255);
ALTER TABLE products ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(50);
ALTER TABLE products ADD COLUMN IF NOT EXISTS gst_rate DECIMAL(5,4);
ALTER TABLE products ADD COLUMN IF NOT EXISTS mrp DECIMAL(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_form VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS consume_type VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS pack_size VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS pack_form VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS key_ingredients TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS strength TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_weight VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS key_benefits TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS direction_for_use TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS safety_information TEXT;

-- Widen hsn_code in case it already existed at a smaller size
ALTER TABLE products ALTER COLUMN hsn_code TYPE VARCHAR(50);

-- Index on product_form and consume_type for filtering
CREATE INDEX IF NOT EXISTS idx_products_product_form ON products(product_form);
CREATE INDEX IF NOT EXISTS idx_products_consume_type ON products(consume_type);


-- Insert products
INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('ACNEPRES CREAM 20 GM', 'Used to treat inflammatory skin conditions like acne, reducing redness and swelling.', 127.8728, ARRAY['Skin Care'], 0,
  'ACNEPRES CREAM 20 GM', '30049099', 0.05, 145.31, 'Cream', 'Topical',
  '20 GM', 'TUBE', 'Betamethasone 0.1% w/w + Clindamycin 1% w/w + Nicotinamide IP 4.0% w/w + Cream', 'Betamethasone 0.1% w/w + Clindamycin 1% w/w + Nicotinamide IP 4.0% w/w + Cream', NULL,
  'Used to treat inflammatory skin conditions like acne, reducing redness and swelling.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('ACTSMART-100 TAB 10*10', 'Treatment of bloating and postprandial fullness (indigestion).', 1608.7544, ARRAY['Digestive Care'], 0,
  'ACTSMART-100 TAB 10*10', '30049099', 0.05, 1828.13, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Acotiamide 100 mg', 'Acotiamide 100 mg', '~130–170 g',
  'Treatment of bloating and postprandial fullness (indigestion).', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('AEROBUD RESPULES 5*5*2ML', 'Used to prevent and treat symptoms of asthma and allergic rhinitis.', 559.3544, ARRAY['Respiratory Care'], 0,
  'AEROBUD RESPULES 5*5*2ML', '30049099', 0.05, 635.63, 'Respules', 'Oral',
  '5*5*2ML', 'MINI BOTTLE', 'Budesonide 0.5 mg/2 ml Nebuliser Suspension', 'Budesonide 0.5 mg/2 ml Nebuliser Suspension', NULL,
  'Used to prevent and treat symptoms of asthma and allergic rhinitis.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('AEROBUD-L RESPULES 5*5*2ML', 'Used to prevent and treat symptoms of asthma and allergic rhinitis.', 814.6863999999999, ARRAY['Respiratory Care'], 0,
  'AEROBUD-L RESPULES 5*5*2ML', '30049099', 0.05, 925.78, 'Respules', 'Oral',
  '5*5*2ML', 'MINI BOTTLE', 'Levosalbutamol Hydrochloride 1.25 mg/2 ml + Budesonide 0.5 mg/2 ml Inhalation Suspension', 'Levosalbutamol Hydrochloride 1.25 mg/2 ml + Budesonide 0.5 mg/2 ml Inhalation Suspension', NULL,
  'Used to prevent and treat symptoms of asthma and allergic rhinitis.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('APPSTORM DROPS 30 ML', 'Used as an appetite stimulant and to relieve allergy symptoms.', 53.627199999999995, ARRAY['Digestive Care'], 0,
  'APPSTORM DROPS 30 ML', '30049099', 0.05, 60.94, 'Drop', 'Oral',
  '30 ML', 'BOTTLE', 'Cyproheptadine Hydrochloride 1.5 mg + Tricholine Citrate 55 mg', 'Cyproheptadine Hydrochloride 1.5 mg + Tricholine Citrate 55 mg', NULL,
  'Used as an appetite stimulant and to relieve allergy symptoms.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('APPSTORM SYP 100 ML 100 ML', 'Used as an appetite stimulant and to relieve allergy symptoms.', 64.3544, ARRAY['Digestive Care'], 0,
  'APPSTORM SYP 100 ML 100 ML', '30049099', 0.05, 73.13, 'Syrup', 'Oral',
  '100 ML', 'BOTTLE', 'Cyproheptadine Hydrochloride 2 mg + Tricholine Citrate 275 mg', 'Cyproheptadine Hydrochloride 2 mg + Tricholine Citrate 275 mg', NULL,
  'Used as an appetite stimulant and to relieve allergy symptoms.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('APPSTORM SYP 200 ML 200 ML', 'Used as an appetite stimulant and to relieve allergy symptoms.', 108.24, ARRAY['Digestive Care'], 0,
  'APPSTORM SYP 200 ML 200 ML', '30049099', 0.05, 123, 'Syrup', 'Oral',
  '200 ML', 'BOTTLE', 'Cyproheptadine Hydrochloride 2 mg + Tricholine Citrate 275 mg', 'Cyproheptadine Hydrochloride 2 mg + Tricholine Citrate 275 mg', NULL,
  'Used as an appetite stimulant and to relieve allergy symptoms.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('AZXP-250 TAB 10*6', 'Antibiotic used for respiratory, skin, and ear bacterial infections.', 658.064, ARRAY['Infection Care'], 0,
  'AZXP-250 TAB 10*6', '30042064', 0.05, 747.8, 'Tablet', 'Oral',
  '10*6', 'STRIP', 'Azithromycin 250 mg', 'Azithromycin 250 mg', '~130–170 g',
  'Antibiotic used for respiratory, skin, and ear bacterial infections.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('AZXP-500 TAB 10*3', 'Antibiotic used for respiratory, skin, and ear bacterial infections.', 664.664, ARRAY['Infection Care'], 0,
  'AZXP-500 TAB 10*3', '30042064', 0.05, 755.3, 'Tablet', 'Oral',
  '10*3', 'STRIP', 'Azithromycin 500 mg', 'Azithromycin 500 mg', '~130–170 g',
  'Antibiotic used for respiratory, skin, and ear bacterial infections.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('AZXP-XL 200 SUSP 30 ML', 'Antibiotic used for respiratory, skin, and ear bacterial infections.', 73.9376, ARRAY['Infection Care'], 0,
  'AZXP-XL 200 SUSP 30 ML', '30049099', 0.05, 84.02, 'Suspension', 'Oral',
  '30 ML', 'BOTTLE', 'Azithromycin 200 mg/5 ml', 'Azithromycin 200 mg/5 ml', NULL,
  'Antibiotic used for respiratory, skin, and ear bacterial infections.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('BACKLIFT-10 TAB 10*10', 'Often used for initial dosing or maintenance for moderate symptoms.', 1023, ARRAY['Pain / Muscle Care'], 0,
  'BACKLIFT-10 TAB 10*10', '30041090', 0.05, 1162.5, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Baclofen 10 mg', 'Baclofen 10 mg', '~130–170 g',
  'Often used for initial dosing or maintenance for moderate symptoms.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('BACKLIFT-20 TAB 10*10', 'Used when a higher concentration is required to manage more severe muscle stiffness.', 1485, ARRAY['Pain / Muscle Care'], 0,
  'BACKLIFT-20 TAB 10*10', '30041090', 0.05, 1687.5, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Baclofen 20 mg', 'Baclofen 20 mg', '~130–170 g',
  'Used when a higher concentration is required to manage more severe muscle stiffness.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('BANIVER-6 TAB 30*1', 'Used to treat parasitic worm infections.', 893.64, ARRAY['Infection Care'], 0,
  'BANIVER-6 TAB 30*1', '30049099', 0.05, 1015.5, 'Tablet', 'Oral',
  '30*1', 'JAR', 'Albendazole 400 mg + Ivermectin 6 mg', 'Albendazole 400 mg + Ivermectin 6 mg', '~130–170 g',
  'Used to treat parasitic worm infections.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('BERBICON TAB 10*1*10', 'support liver health, improve digestion, help control blood sugar, and fight infections.', 1488.08, ARRAY['General / Other Care'], 0,
  'BERBICON TAB 10*1*10', '21069099', 0.05, 1691, 'Tablet', 'Oral',
  '10*1*10', 'STRIP', 'Berberis Aristata 500 mg', 'Berberis Aristata 500 mg', '~160–230 grams',
  'support liver health, improve digestion, help control blood sugar, and fight infections.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('BIDSORAL-FORTE TAB 10*20', 'Contains Trypsin–Chymotrypsin, which is used to reduce inflammation and swelling associated with trauma, surgery, or injury. It helps in faster healing of wounds and edema.', 3740, ARRAY['Pain / Muscle Care'], 0,
  'BIDSORAL-FORTE TAB 10*20', '30049099', 0.05, 4250, 'Tablet', 'Oral',
  '10*20', 'STRIP', 'Trypsin–Chymotrypsin (100,000 AU)', 'Trypsin–Chymotrypsin (100,000 AU)', '~130–170 g',
  'Contains Trypsin–Chymotrypsin, which is used to reduce inflammation and swelling associated with trauma, surgery, or injury. It helps in faster healing of wounds and edema.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('BITSOME-40 INJ 40 MG', 'An injectable form of Esomeprazole used for the short-term treatment of Gastroesophageal Reflux Disease (GERD) and stomach ulcers when oral therapy is not possible.', 94.8728, ARRAY['Digestive Care'], 0,
  'BITSOME-40 INJ 40 MG', '30049039', 0.05, 107.81, 'Injection', 'IV',
  '40 MG', 'VAIL', 'Esomeprazole Sodium 40 mg', 'Esomeprazole Sodium 40 mg', NULL,
  'An injectable form of Esomeprazole used for the short-term treatment of Gastroesophageal Reflux Disease (GERD) and stomach ulcers when oral therapy is not possible.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('BITSOME-40 TAB 10*10', 'An oral tablet of Esomeprazole used to treat acid-related conditions like heartburn, acid reflux, and peptic ulcers by reducing stomach acid production.', 783.7544, ARRAY['Digestive Care'], 0,
  'BITSOME-40 TAB 10*10', '30049034', 0.05, 890.63, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Esomeprazole 40 mg', 'Esomeprazole 40 mg', '~130–170 g',
  'An oral tablet of Esomeprazole used to treat acid-related conditions like heartburn, acid reflux, and peptic ulcers by reducing stomach acid production.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('BITSOME-LS CAP 10*10', 'Combines Esomeprazole with Levosulpiride. It is used to treat GERD, irritable bowel syndrome (IBS), and chronic dyspepsia (indigestion) where acid reflux is combined with gut motility issues.', 2464, ARRAY['Digestive Care'], 0,
  'BITSOME-LS CAP 10*10', '300490', 0.05, 2800, 'Capsule', 'Oral',
  '10*10', 'STRIP', 'Esomeprazole 40 mg (EC) + Levosulpiride 75 mg (SR)', 'Esomeprazole 40 mg (EC) + Levosulpiride 75 mg (SR)', '~130–170 g',
  'Combines Esomeprazole with Levosulpiride. It is used to treat GERD, irritable bowel syndrome (IBS), and chronic dyspepsia (indigestion) where acid reflux is combined with gut motility issues.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('BITSOME-RD CAP (ALU ALU) 10*10', 'Combines Esomeprazole and Domperidone. Used to treat GERD and acid reflux specifically when accompanied by nausea or vomiting.', 1276, ARRAY['Digestive Care'], 0,
  'BITSOME-RD CAP (ALU ALU) 10*10', '300490', 0.05, 1450, 'Capsule', 'Oral',
  '10*10', 'STRIP', 'Esomeprazole 40 mg + Domperidone 10 mg (IR) + Domperidone 20 mg (SR)', 'Esomeprazole 40 mg + Domperidone 10 mg (IR) + Domperidone 20 mg (SR)', NULL,
  'Combines Esomeprazole and Domperidone. Used to treat GERD and acid reflux specifically when accompanied by nausea or vomiting.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('BITSOME-RD CAP 10*10', 'Also a combination of Esomeprazole and Domperidone (standard packaging) used for managing acid reflux and nausea.', 1108.8, ARRAY['Digestive Care'], 0,
  'BITSOME-RD CAP 10*10', '30049039', 0.05, 1260, 'Capsule', 'Oral',
  '10*10', 'STRIP', 'Esomeprazole 40 mg + Domperidone 10 mg (IR) + Domperidone 20 mg (SR)', 'Esomeprazole 40 mg + Domperidone 10 mg (IR) + Domperidone 20 mg (SR)', '~130–170 g',
  'Also a combination of Esomeprazole and Domperidone (standard packaging) used for managing acid reflux and nausea.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('BLINKMOX EYE DROPS 5 ML', 'Contains Moxifloxacin, a fluoroquinolone antibiotic used to treat bacterial eye infections, such as bacterial conjunctivitis (pink eye).', 94.8728, ARRAY['Eye/Ear/Nasal Care'], 0,
  'BLINKMOX EYE DROPS 5 ML', '30049099', 0.05, 107.81, 'Eye drops', 'Topical',
  '5 ML', 'PLASTIC BOTTLE', 'Moxifloxacin Hydrochloride 0.5% w/v Ophthalmic Solution', 'Moxifloxacin Hydrochloride 0.5% w/v Ophthalmic Solution', NULL,
  'Contains Moxifloxacin, a fluoroquinolone antibiotic used to treat bacterial eye infections, such as bacterial conjunctivitis (pink eye).', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('BLINKMOX-D EYE DROPS 5 ML', 'Bacterial eye infections with significant inflammation/swelling.', 99, ARRAY['Eye/Ear/Nasal Care'], 0,
  'BLINKMOX-D EYE DROPS 5 ML', '30049099', 0.05, 112.5, 'Eye drops', 'Topical',
  '5 ML', 'PLASTIC BOTTLE', 'Moxifloxacin 0.5% w/v + Dexamethasone Sodium Phosphate 0.1% w/v Eye Drops', 'Moxifloxacin 0.5% w/v + Dexamethasone Sodium Phosphate 0.1% w/v Eye Drops', NULL,
  'Bacterial eye infections with significant inflammation/swelling.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('BLINKMOX-KT EYE DROPS 5 ML', 'Bacterial eye infections accompanied by pain or post-surgical inflammation.', 107.25439999999999, ARRAY['Eye/Ear/Nasal Care'], 0,
  'BLINKMOX-KT EYE DROPS 5 ML', '30049099', 0.05, 121.88, 'Eye drops', 'Topical',
  '5 ML', 'PLASTIC BOTTLE', 'Moxifloxacin 0.5% w/v + Ketorolac Tromethamine 0.5% w/v Ophthalmic Solution', 'Moxifloxacin 0.5% w/v + Ketorolac Tromethamine 0.5% w/v Ophthalmic Solution', NULL,
  'Bacterial eye infections accompanied by pain or post-surgical inflammation.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('BLINKMOX-LP EYE DROPS 5 ML', 'Bacterial eye infections; uses a "soft" steroid to minimize eye pressure risks.', 144.3728, ARRAY['Eye/Ear/Nasal Care'], 0,
  'BLINKMOX-LP EYE DROPS 5 ML', '30049099', 0.05, 164.06, 'Eye drops', 'Topical',
  '5 ML', 'PLASTIC BOTTLE', 'Moxifloxacin Hydrochloride 0.5% w/v + Loteprednol Etabonate 0.5% w/v + Benzalkonium Chloride Solution 0.02% v/v Ophthalmic Suspension', 'Moxifloxacin Hydrochloride 0.5% w/v + Loteprednol Etabonate 0.5% w/v + Benzalkonium Chloride Solution 0.02% v/v Ophthalmic Suspension', NULL,
  'Bacterial eye infections; uses a "soft" steroid to minimize eye pressure risks.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('BLISSGARD CAP 10*1*10', 'Probiotic support for urinary tract health and vaginal flora balance.', 3681.04, ARRAY['Nutritional Supplement'], 0,
  'BLISSGARD CAP 10*1*10', '21069099', 0.05, 4183, 'Capsule', 'Oral',
  '10*1*10', 'STRIP', 'Lactobacillus rhamnosus - 1 billion CFU, Lactobacillus plantarum - 250 million CFU, Lactobacillus acidophilus - 250 million CFU, D-Mannose - 250 mg, Cranberry Extract - 150 mg, Hibiscus sabdariffa Extract - 50 mg, Vitamin A - 150 mcg', 'Lactobacillus rhamnosus - 1 billion CFU, Lactobacillus plantarum - 250 million CFU, Lactobacillus acidophilus - 250 million CFU, D-Mannose - 250 mg, Cranberry Extract - 150 mg, Hibiscus sabdariffa Extract - 50 mg, Vitamin A - 150 mcg', '~160–230 grams',
  'Probiotic support for urinary tract health and vaginal flora balance.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('BLISSGARD SYP 225 ML', 'Prevention of UTIs and management of urinary pH/kidney stone prevention.', 158.4, ARRAY['General / Other Care'], 0,
  'BLISSGARD SYP 225 ML', '21069099', 0.05, 180, 'Syrup', 'Oral',
  '225 ML', 'BOTTLE', 'Potassium Magnesium Citrate 978 mg + Potassium Citrate Anhydrous 714.9 mg + Magnesium Citrate Anhydrous 263.10 mg + Cranberry Extract 200 mg + DMannose 300 mg', 'Potassium Magnesium Citrate 978 mg + Potassium Citrate Anhydrous 714.9 mg + Magnesium Citrate Anhydrous 263.10 mg + Cranberry Extract 200 mg + DMannose 300 mg', NULL,
  'Prevention of UTIs and management of urinary pH/kidney stone prevention.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('BLISSGARD-V WASH 100 ML', 'Daily external intimate hygiene to maintain pH balance and prevent odor/itching.', 167.2, ARRAY['General / Other Care'], 0,
  'BLISSGARD-V WASH 100 ML', '34022020       34022020', 0.18, 190, NULL, 'Topical',
  '100 ML', 'BOTTLE', 'Hygiene Wash & PH Balance Formula with Tea Tree Oil & Lactic Acid (Vaginal Wash)', 'Hygiene Wash & PH Balance Formula with Tea Tree Oil & Lactic Acid (Vaginal Wash)', NULL,
  'Daily external intimate hygiene to maintain pH balance and prevent odor/itching.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('BRIVAPOSE-50 TAB 10*10', 'Management and control of partial-onset seizures (Epilepsy).', 2021.2544, ARRAY['General / Other Care'], 0,
  'BRIVAPOSE-50 TAB 10*10', '30049099', 0.05, 2296.88, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Brivaracetam 50 mg', 'Brivaracetam 50 mg', '~130–170 g',
  'Management and control of partial-onset seizures (Epilepsy).', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('BRUSCON SUSP 100 ML', 'Relief from fever and mild-to-moderate pain (headache, body ache).', 48.4, ARRAY['Pain / Muscle Care'], 0,
  'BRUSCON SUSP 100 ML', '30049099', 0.05, 55, 'Suspension', 'Oral',
  '100 ML', 'BOTTLE', 'Ibuprofen 100 mg + Paracetamol 162.50 mg', 'Ibuprofen 100 mg + Paracetamol 162.50 mg', NULL,
  'Relief from fever and mild-to-moderate pain (headache, body ache).', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('BUCKSTOP INJ 1 GM', 'Treatment of severe, life-threatening hospital-acquired bacterial infections.', 895.6464, ARRAY['Infection Care'], 0,
  'BUCKSTOP INJ 1 GM', '30042019', 0.05, 1017.78, 'Injection', 'IV',
  '1 GM', 'MINI BOTTLE', 'Meropenem 1 gm', 'Meropenem 1 gm', NULL,
  'Treatment of severe, life-threatening hospital-acquired bacterial infections.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CABSMILE-0.5 TAB 10*1*4', 'Lowers high prolactin levels; used in infertility, irregular periods, and abnormal milk secretion', 4004, ARRAY['General / Other Care'], 0,
  'CABSMILE-0.5 TAB 10*1*4', '30045090', 0.05, 4550, 'Tablet', 'Oral',
  '10*1*4', 'STRIP', 'Cabergoline 0.5 mg', 'Cabergoline 0.5 mg', '~160–230 grams',
  'Lowers high prolactin levels; used in infertility, irregular periods, and abnormal milk secretion', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CAMYLOCK TAB 10*15', 'Relief from abdominal cramps, stomach pain, and menstrual pain', 871.2, ARRAY['Pain / Muscle Care'], 0,
  'CAMYLOCK TAB 10*15', '30049099', 0.05, 990, 'Tablet', 'Oral',
  '10*15', 'STRIP', 'Camylofin Dihydrochloride 25 mg + Paracetamol 325 mg', 'Camylofin Dihydrochloride 25 mg + Paracetamol 325 mg', NULL,
  'Relief from abdominal cramps, stomach pain, and menstrual pain', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CANBLISS-150 TAB 6*5*1', 'Treatment of fungal infections including vaginal yeast infection', 318.78000000000003, ARRAY['General / Other Care'], 0,
  'CANBLISS-150 TAB 6*5*1', '300410', 0.05, 362.25, 'Tablet', 'Oral',
  '6*5*1', 'STRIP', 'Fluconazole 150 mg', 'Fluconazole 150 mg', '~160–230 grams',
  'Treatment of fungal infections including vaginal yeast infection', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CANBLISS-200 TAB 6*5*1', 'Used for moderate fungal infections and recurrent candidiasis', 461.58639999999997, ARRAY['General / Other Care'], 0,
  'CANBLISS-200 TAB 6*5*1', '300410', 0.05, 524.53, 'Tablet', 'Oral',
  '6*5*1', 'STRIP', 'Fluconazole 200 mg', 'Fluconazole 200 mg', '~160–230 grams',
  'Used for moderate fungal infections and recurrent candidiasis', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CANBLISS-400 TAB 20*1 TAB', 'Used in severe or systemic fungal infections', 491.20720000000006, ARRAY['General / Other Care'], 0,
  'CANBLISS-400 TAB 20*1 TAB', '30049099', 0.05, 558.19, 'Tablet', 'Oral',
  '20*1 TAB', 'STRIP', 'Fluconazole 400 mg', 'Fluconazole 400 mg', NULL,
  'Used in severe or systemic fungal infections', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CANBLISS-I DS TAB 6*5*1', 'Treatment of resistant fungal infections with parasitic infestation', 660, ARRAY['Infection Care'], 0,
  'CANBLISS-I DS TAB 6*5*1', '300490', 0.05, 750, 'Tablet', 'Oral',
  '6*5*1', 'STRIP', 'Fluconazole 300 mg + Ivermectin 12 mg', 'Fluconazole 300 mg + Ivermectin 12 mg', NULL,
  'Treatment of resistant fungal infections with parasitic infestation', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CANTBEAT SOAP 75 GM', 'Used for fungal skin infections, dandruff, and itching', 97.85600000000001, ARRAY['Skin Care'], 0,
  'CANTBEAT SOAP 75 GM', '34011110', 0.05, 111.2, 'Soap', 'topical',
  '75 GM', 'BOX', 'Ketoconazole 2% w/w', 'Ketoconazole 2% w/w', NULL,
  'Used for fungal skin infections, dandruff, and itching', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CANTBEAT-6 CREAM 15 GM', 'Used in mixed skin infections with itching, redness, and inflammation', 101.2, ARRAY['Skin Care'], 0,
  'CANTBEAT-6 CREAM 15 GM', '30049099', 0.05, 115, 'Soap', 'topical',
  '15 GM', 'BOX', 'Ketoconazole, Tolnaftate, Neomycin Sulphate, Dexpanthenol, Iodochlorhydroxyquinoline & Clobetasol Propionate Cream', 'Ketoconazole, Tolnaftate, Neomycin Sulphate, Dexpanthenol, Iodochlorhydroxyquinoline & Clobetasol Propionate Cream', NULL,
  'Used in mixed skin infections with itching, redness, and inflammation', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CEREBOON SYP 225 ML', 'Improves memory, concentration, and mental strength', 144.3728, ARRAY['General / Other Care'], 0,
  'CEREBOON SYP 225 ML', '30049011', 0.05, 164.06, 'Syrup', 'Oral',
  '225 ML', 'BOTTLE', 'Herbal Brain Syrup', 'Herbal Brain Syrup', NULL,
  'Improves memory, concentration, and mental strength', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CEREBOON-DHA SG CAP 10*1*10', 'Supports brain health, nerve function, and nutritional deficiencies', 2186.2544000000003, ARRAY['Nutritional Supplement'], 0,
  'CEREBOON-DHA SG CAP 10*1*10', '30045090', 0.05, 2484.38, 'Softgel Capsule', 'Oral',
  '10*1*10', 'STRIP', 'L-Methyl Folate 1 mg + Methylcobalamin 1500 mcg + Pyridoxal-5 Phosphate 0.5 mg + DHA (40%) 200 mg + Vitamin D3 2000 IU', 'L-Methyl Folate 1 mg + Methylcobalamin 1500 mcg + Pyridoxal-5 Phosphate 0.5 mg + DHA (40%) 200 mg + Vitamin D3 2000 IU', NULL,
  'Supports brain health, nerve function, and nutritional deficiencies', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CEREBOON-GOLD SG CAP 10*1*10', 'Used for nerve health, diabetic neuropathy, and nutritional deficiencies (B-complex and antioxidants).', 2062.5, ARRAY['Skin Care'], 0,
  'CEREBOON-GOLD SG CAP 10*1*10', '30049099', 0.05, 2343.75, 'Softgel Capsule', 'Oral',
  '10*1*10', 'STRIP', 'Alpha Lipoic Acid 100 mg, Pyridoxine Hydrochloride 3 mg, Methylcobalamin 1500 mcg, Folic Acid 1.5 mg, Benfotiamine 100 mg Softgel Capsules', 'Alpha Lipoic Acid 100 mg, Pyridoxine Hydrochloride 3 mg, Methylcobalamin 1500 mcg, Folic Acid 1.5 mg, Benfotiamine 100 mg Softgel Capsules', '~160–230 grams',
  'Used for nerve health, diabetic neuropathy, and nutritional deficiencies (B-complex and antioxidants).', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CEREBOON-LC TAB 10*1*10', 'Often used for muscle cramps, carnitine deficiency, and supporting nerve recovery.', 2020.48, ARRAY['Nutritional Supplement'], 0,
  'CEREBOON-LC TAB 10*1*10', '30049099', 0.05, 2296, 'Tablet', 'Oral',
  '10*1*10', 'STRIP', 'L-Carnitine-L-Tartrate 500 mg, Folic Acid 1.5 mg & Methylcobalamin 1500 mcg', 'L-Carnitine-L-Tartrate 500 mg, Folic Acid 1.5 mg & Methylcobalamin 1500 mcg', NULL,
  'Often used for muscle cramps, carnitine deficiency, and supporting nerve recovery.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CEREBOON-NT TAB 10*10', 'Used for chronic nerve pain, sciatica, and fibromyalgia. Contains Nortriptyline to help with associated sleep or mood issues.', 1526.2544, ARRAY['General / Other Care'], 0,
  'CEREBOON-NT TAB 10*10', '30049099', 0.05, 1734.38, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Pregabalin 75 mg + Nortriptyline HCl 10 mg', 'Pregabalin 75 mg + Nortriptyline HCl 10 mg', '~130–170 g',
  'Used for chronic nerve pain, sciatica, and fibromyalgia. Contains Nortriptyline to help with associated sleep or mood issues.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CEREBOON-PG CAP 10*10', 'Combines Pregabalin for nerve signals and Methylcobalamin (B12) to help repair the nerve''s protective sheath.', 1152.8, ARRAY['Nutritional Supplement'], 0,
  'CEREBOON-PG CAP 10*10', '30045010', 0.05, 1310, 'Capsule', 'Oral',
  '10*10', 'STRIP', 'Pregabalin 75 mg + Methylcobalamin 750 mcg', 'Pregabalin 75 mg + Methylcobalamin 750 mcg', '~130–170 g',
  'Combines Pregabalin for nerve signals and Methylcobalamin (B12) to help repair the nerve''s protective sheath.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CEREBOON-PGN TAB 10*10', 'Used for chronic nerve pain, sciatica, and fibromyalgia. Contains Nortriptyline to help with associated sleep or mood issues.', 1815, ARRAY['Nutritional Supplement'], 0,
  'CEREBOON-PGN TAB 10*10', '30049099', 0.05, 2062.5, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Pregabalin (SR) 75 mg, Methylcobalamin 1500 mcg & Nortriptyline 10 mg', 'Pregabalin (SR) 75 mg, Methylcobalamin 1500 mcg & Nortriptyline 10 mg', '~130–170 g',
  'Used for chronic nerve pain, sciatica, and fibromyalgia. Contains Nortriptyline to help with associated sleep or mood issues.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CEREBOON-PLUS CAP 10*10', 'Used for nerve health, diabetic neuropathy, and nutritional deficiencies (B-complex and antioxidants).', 1443.7544, ARRAY['Nutritional Supplement'], 0,
  'CEREBOON-PLUS CAP 10*10', '30045010', 0.05, 1640.63, 'Capsule', 'Oral',
  '10*10', 'STRIP', 'Methylcobalamin 1500 mcg + Alpha Lipoic Acid 100 mg + Thiamine Mononitrate 10 mg + Pyridoxine Hydrochloride 3 mg + Folic Acid 1.5 mg Capsules', 'Methylcobalamin 1500 mcg + Alpha Lipoic Acid 100 mg + Thiamine Mononitrate 10 mg + Pyridoxine Hydrochloride 3 mg + Folic Acid 1.5 mg Capsules', '~130–170 g',
  'Used for nerve health, diabetic neuropathy, and nutritional deficiencies (B-complex and antioxidants).', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CETMOLIN-10 TAB 10*10', 'Used to relieve symptoms of allergic rhinitis (hay fever), such as sneezing, runny nose, and itchy eyes, as well as chronic hives (urticaria).', 792, ARRAY['Respiratory Care'], 0,
  'CETMOLIN-10 TAB 10*10', '30049099', 0.05, 900, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Levocetirizine Dihydrochloride 10 mg', 'Levocetirizine Dihydrochloride 10 mg', '~130–170 g',
  'Used to relieve symptoms of allergic rhinitis (hay fever), such as sneezing, runny nose, and itchy eyes, as well as chronic hives (urticaria).', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CETMOLIN-5 TAB 10*10', 'Used to relieve symptoms of allergic rhinitis (hay fever), such as sneezing, runny nose, and itchy eyes, as well as chronic hives (urticaria).', 396, ARRAY['Respiratory Care'], 0,
  'CETMOLIN-5 TAB 10*10', '30049099', 0.05, 450, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Levocetirizine Hydrochloride 5 mg', 'Levocetirizine Hydrochloride 5 mg', '~130–170 g',
  'Used to relieve symptoms of allergic rhinitis (hay fever), such as sneezing, runny nose, and itchy eyes, as well as chronic hives (urticaria).', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CHEERTEL-40 TAB 10*15', 'Hypertension (High Blood Pressure) and heart-related conditions', 957, ARRAY['Cardiac / Diabetes Care'], 0,
  'CHEERTEL-40 TAB 10*15', '30049079', 0.05, 1087.5, 'Tablet', 'Oral',
  '10*15', 'STRIP', 'Telmisartan 40 mg', 'Telmisartan 40 mg', NULL,
  'Hypertension (High Blood Pressure) and heart-related conditions', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CHEERTEL-80 TAB 10*10', 'Hypertension (High Blood Pressure) and heart-related conditions', 866.2544, ARRAY['Cardiac / Diabetes Care'], 0,
  'CHEERTEL-80 TAB 10*10', '30049079', 0.05, 984.38, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Telmisartan 80 mg', 'Telmisartan 80 mg', '~130–170 g',
  'Hypertension (High Blood Pressure) and heart-related conditions', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CHEERTEL-AH TAB 10*15', 'Hypertension (High Blood Pressure) and heart-related conditions', 1278.7544, ARRAY['Cardiac / Diabetes Care'], 0,
  'CHEERTEL-AH TAB 10*15', '30049079', 0.05, 1453.13, 'Tablet', 'Oral',
  '10*15', 'STRIP', 'Telmisartan 40 mg + Amlodipine 5 mg + Hydrochlorothiazide 12.5 mg', 'Telmisartan 40 mg + Amlodipine 5 mg + Hydrochlorothiazide 12.5 mg', NULL,
  'Hypertension (High Blood Pressure) and heart-related conditions', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CHEERTEL-AM TAB 10*15', 'Hypertension (High Blood Pressure) and heart-related conditions', 1229.2544, ARRAY['Cardiac / Diabetes Care'], 0,
  'CHEERTEL-AM TAB 10*15', '30049079', 0.05, 1396.88, 'Tablet', 'Oral',
  '10*15', 'STRIP', 'Telmisartan 40 mg + Amlodipine 5 mg', 'Telmisartan 40 mg + Amlodipine 5 mg', NULL,
  'Hypertension (High Blood Pressure) and heart-related conditions', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CHEERTEL-CL 40 TAB 10*15', 'Hypertension (High Blood Pressure) and heart-related conditions', 1361.2544, ARRAY['Cardiac / Diabetes Care'], 0,
  'CHEERTEL-CL 40 TAB 10*15', '30049079', 0.05, 1546.88, 'Tablet', 'Oral',
  '10*15', 'STRIP', 'Telmisartan 40 mg + Cilnidipine 10 mg', 'Telmisartan 40 mg + Cilnidipine 10 mg', NULL,
  'Hypertension (High Blood Pressure) and heart-related conditions', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CHEERTEL-CT 40/6.25 TAB 10*10', 'Hypertension (High Blood Pressure) and heart-related conditions', 1113.7544, ARRAY['Cardiac / Diabetes Care'], 0,
  'CHEERTEL-CT 40/6.25 TAB 10*10', '30049079', 0.05, 1265.63, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Telmisartan 40 mg + Chlorthalidone 6.25 mg', 'Telmisartan 40 mg + Chlorthalidone 6.25 mg', '~130–170 g',
  'Hypertension (High Blood Pressure) and heart-related conditions', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CHEERTEL-H TAB 10*15', 'Hypertension (High Blood Pressure) and heart-related conditions', 1113.7544, ARRAY['Cardiac / Diabetes Care'], 0,
  'CHEERTEL-H TAB 10*15', '30049079', 0.05, 1265.63, 'Tablet', 'Oral',
  '10*15', 'STRIP', 'Telmisartan 40 mg + Hydrochlorothiazide 12.5 mg', 'Telmisartan 40 mg + Hydrochlorothiazide 12.5 mg', NULL,
  'Hypertension (High Blood Pressure) and heart-related conditions', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CHEERTEL-MCL 25 TAB 10*15', 'Hypertension (High Blood Pressure) and heart-related conditions', 1608.7544, ARRAY['Cardiac / Diabetes Care'], 0,
  'CHEERTEL-MCL 25 TAB 10*15', '30049079', 0.05, 1828.13, 'Tablet', 'Oral',
  '10*15', 'STRIP', 'Telmisartan 40 mg + Metoprolol Succinate (ER) 23.75 mg + Cilnidipine 10 mg', 'Telmisartan 40 mg + Metoprolol Succinate (ER) 23.75 mg + Cilnidipine 10 mg', NULL,
  'Hypertension (High Blood Pressure) and heart-related conditions', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CHEERTEL-MXL 25 TAB 10*10', 'Hypertension (High Blood Pressure) and heart-related conditions', 1402.5, ARRAY['Cardiac / Diabetes Care'], 0,
  'CHEERTEL-MXL 25 TAB 10*10', '30049079', 0.05, 1593.75, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Telmisartan 40 mg + Metoprolol Succinate (PR) 23.75 mg', 'Telmisartan 40 mg + Metoprolol Succinate (PR) 23.75 mg', '~130–170 g',
  'Hypertension (High Blood Pressure) and heart-related conditions', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CHEERTEL-MXL 50 TAB 10*10', 'Hypertension (High Blood Pressure) and heart-related conditions', 1608.7544, ARRAY['Cardiac / Diabetes Care'], 0,
  'CHEERTEL-MXL 50 TAB 10*10', '30049079', 0.05, 1828.13, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Telmisartan 40 mg + Metoprolol Succinate (ER) 50 mg', 'Telmisartan 40 mg + Metoprolol Succinate (ER) 50 mg', '~130–170 g',
  'Hypertension (High Blood Pressure) and heart-related conditions', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CITRONORM SYP 100 ML', 'Kidney stones, Gout, and Urinary Tract Infections (UTI)', 94.8728, ARRAY['General / Other Care'], 0,
  'CITRONORM SYP 100 ML', '30049099', 0.05, 107.81, 'Syrup', 'Oral',
  '100 ML', 'BOTTLE', 'Disodium Hydrogen Citrate B.P. 1.3 gm', 'Disodium Hydrogen Citrate B.P. 1.3 gm', NULL,
  'Kidney stones, Gout, and Urinary Tract Infections (UTI)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CITRONORM-K SYP 200 ML', 'Kidney stones, Gout, and Urinary Tract Infections (UTI)', 180.6728, ARRAY['General / Other Care'], 0,
  'CITRONORM-K SYP 200 ML', '30049099', 0.05, 205.31, 'Syrup', 'Oral',
  '200 ML', 'BOTTLE', 'Potassium Citrate 1100 mg + Magnesium Citrate 375 mg + Pyridoxine Hydrochloride 20 mg', 'Potassium Citrate 1100 mg + Magnesium Citrate 375 mg + Pyridoxine Hydrochloride 20 mg', NULL,
  'Kidney stones, Gout, and Urinary Tract Infections (UTI)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CLOTSURE INJ 5*5 ML', 'Control of heavy bleeding (menstrual or surgical)', 64.4424, ARRAY['General / Other Care'], 0,
  'CLOTSURE INJ 5*5 ML', '30049069', 0.05, 73.23, 'Injection', 'IV',
  '5*5 ML', 'MINI BOTTLE', 'Tranexamic Acid', 'Tranexamic Acid', NULL,
  'Control of heavy bleeding (menstrual or surgical)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CLOTSURE-500 TAB 10*10', 'Control of heavy bleeding (menstrual or surgical)', 1600.5, ARRAY['General / Other Care'], 0,
  'CLOTSURE-500 TAB 10*10', '30049099', 0.05, 1818.75, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Tranexamic Acid 500 mg', 'Tranexamic Acid 500 mg', '~130–170 g',
  'Control of heavy bleeding (menstrual or surgical)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CLOTSURE-M TAB 10*10', 'Control of heavy bleeding (menstrual or surgical)', 1927.2, ARRAY['Pain / Muscle Care'], 0,
  'CLOTSURE-M TAB 10*10', '30049066', 0.05, 2190, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Tranexamic Acid 500 mg + Mefenamic Acid 250 mg', 'Tranexamic Acid 500 mg + Mefenamic Acid 250 mg', '~130–170 g',
  'Control of heavy bleeding (menstrual or surgical)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('COLSVIT-PLUS TAB 10*1*10', 'Nutritional supplement for bone health, nerve health, or immunity', 2191.2, ARRAY['Nutritional Supplement'], 0,
  'COLSVIT-PLUS TAB 10*1*10', '21069099', 0.05, 2490, 'Tablet', 'Oral',
  '10*1*10', 'STRIP', 'Colostrum, curcumin, Piper, Lycopene & Beta Carotene Chewable Tablets', 'Colostrum, curcumin, Piper, Lycopene & Beta Carotene Chewable Tablets', NULL,
  'Nutritional supplement for bone health, nerve health, or immunity', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('COOLBITE SUSP 170 ML', 'Acidity, heartburn, stomach ulcers, and GERD', 90.75439999999999, ARRAY['General / Other Care'], 0,
  'COOLBITE SUSP 170 ML', '481910', 0.05, 103.13, 'Suspension', 'Oral',
  '170 ML', 'BOTTLE', 'Dried Aluminium Hydroxide 250 mg + Magnesium Hydroxide 250 mg + Activated Dimethicone 50 mg/ 10 ml (Sugar Free) (Mint)', 'Dried Aluminium Hydroxide 250 mg + Magnesium Hydroxide 250 mg + Activated Dimethicone 50 mg/ 10 ml (Sugar Free) (Mint)', NULL,
  'Acidity, heartburn, stomach ulcers, and GERD', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('COOLBITE-MS SUSP 170 ML', 'Acidity, heartburn, stomach ulcers, and GERD', 107.25439999999999, ARRAY['Digestive Care'], 0,
  'COOLBITE-MS SUSP 170 ML', '30049039', 0.05, 121.88, 'Suspension', 'Oral',
  '170 ML', 'BOTTLE', 'Magaldrate 400 mg + Simethicone 20 mg/5 ml (Sugar Free) (Mango)', 'Magaldrate 400 mg + Simethicone 20 mg/5 ml (Sugar Free) (Mango)', NULL,
  'Acidity, heartburn, stomach ulcers, and GERD', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('COOLBITE-MSD SUSP 170 ML', 'Acidity, heartburn, stomach ulcers, and GERD', 119.6272, ARRAY['Digestive Care'], 0,
  'COOLBITE-MSD SUSP 170 ML', '30049032', 0.05, 135.94, 'Suspension', 'Oral',
  '170 ML', 'BOTTLE', 'Magaldrate 480 mg + Simethicone 20 mg + Domperidone 10 mg/10 ml (Sugar Free) (Saunf)', 'Magaldrate 480 mg + Simethicone 20 mg + Domperidone 10 mg/10 ml (Sugar Free) (Saunf)', NULL,
  'Acidity, heartburn, stomach ulcers, and GERD', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('COOLBITE-S SUSP 100 ML', 'Acidity, heartburn, stomach ulcers, and GERD', 120.45439999999999, ARRAY['Digestive Care'], 0,
  'COOLBITE-S SUSP 100 ML', '30049039', 0.05, 136.88, 'Suspension', 'Oral',
  '100 ML', 'BOTTLE', 'Sucralfate 1 gm + Oxetacaine 20 mg/10 ml (Sugar Free)', 'Sucralfate 1 gm + Oxetacaine 20 mg/10 ml (Sugar Free)', NULL,
  'Acidity, heartburn, stomach ulcers, and GERD', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('COOLBITE-S SUSP 200 ML', 'Acidity, heartburn, stomach ulcers, and GERD', 229.3544, ARRAY['Digestive Care'], 0,
  'COOLBITE-S SUSP 200 ML', '30049039', 0.05, 260.63, 'Suspension', 'Oral',
  '200 ML', 'BOTTLE', 'Sucralfate 1 gm + Oxetacaine 20 mg/10 ml (Sugar Free)', 'Sucralfate 1 gm + Oxetacaine 20 mg/10 ml (Sugar Free)', NULL,
  'Acidity, heartburn, stomach ulcers, and GERD', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('COXCALM-120 TAB 10*10', 'Pain relief, inflammation, muscle spasms, and fever', 1672, ARRAY['Pain / Muscle Care'], 0,
  'COXCALM-120 TAB 10*10', '30049099', 0.05, 1900, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Etoricoxib 120 mg', 'Etoricoxib 120 mg', '~130–170 g',
  'Pain relief, inflammation, muscle spasms, and fever', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('COXCALM-90 TAB 10*10', 'Pain relief, inflammation, muscle spasms, and fever', 1188, ARRAY['Pain / Muscle Care'], 0,
  'COXCALM-90 TAB 10*10', '30049069', 0.05, 1350, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Etoricoxib 90 mg', 'Etoricoxib 90 mg', '~130–170 g',
  'Pain relief, inflammation, muscle spasms, and fever', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('COXCALM-P TAB 10*10', 'Pain relief, inflammation, muscle spasms, and fever', 1196.2544, ARRAY['Pain / Muscle Care'], 0,
  'COXCALM-P TAB 10*10', '300490', 0.05, 1359.38, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Etoricoxib 60 mg + Paracetamol 325 mg', 'Etoricoxib 60 mg + Paracetamol 325 mg', '~130–170 g',
  'Pain relief, inflammation, muscle spasms, and fever', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('COXCALM-TH4 TAB 10*10', 'Pain relief, inflammation, muscle spasms, and fever', 2640, ARRAY['Pain / Muscle Care'], 0,
  'COXCALM-TH4 TAB 10*10', '30049069', 0.05, 3000, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Etoricoxib 60 mg + Thiocolchicoside 4 mg', 'Etoricoxib 60 mg + Thiocolchicoside 4 mg', '~130–170 g',
  'Pain relief, inflammation, muscle spasms, and fever', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CRAMPION-PLUS TAB 10*1*10', 'Kidney stones, Gout, and Urinary Tract Infections (UTI)', 1409.76, ARRAY['Nutritional Supplement'], 0,
  'CRAMPION-PLUS TAB 10*1*10', '21069099', 0.05, 1602, 'Tablet', 'Oral',
  '10*1*10', 'STRIP', 'Magnesium Sulphate 250 mg + L-Carnitine L-Tartrate 300 mg + Calcium Citrate 250 mg + Potassium 50 mg + Vitamin C 100 mg + Vitamin E 10 mg + Vitamin B12 2.2 mcg + Vitamin D3 (250 IU / 6.25 mcg) + Vitamin B6 2.4 mg + Vitamin B5 5 mg + Vitamin B1 1.5 mg + Chromium 40 mcg', 'Magnesium Sulphate 250 mg + L-Carnitine L-Tartrate 300 mg + Calcium Citrate 250 mg + Potassium 50 mg + Vitamin C 100 mg + Vitamin E 10 mg + Vitamin B12 2.2 mcg + Vitamin D3 (250 IU / 6.25 mcg) + Vitamin B6 2.4 mg + Vitamin B5 5 mg + Vitamin B1 1.5 mg + Chromium 40 mcg', NULL,
  'Kidney stones, Gout, and Urinary Tract Infections (UTI)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CRANPRES-IV INFUSION 100 ML', 'Used for various medical conditions; consult a physician for specific use.', 243.3728, ARRAY['General / Other Care'], 0,
  'CRANPRES-IV INFUSION 100 ML', '30049099', 0.05, 276.56, 'Infusion', 'IV',
  '100 ML', 'BOTTLE', 'Mannitol 10% w/v & Glycerin 10% w/v IV Infusion', 'Mannitol 10% w/v & Glycerin 10% w/v IV Infusion', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CREMCAL SUSP 200 ML', 'Acidity, heartburn, stomach ulcers, and GERD', 115.28, ARRAY['Nutritional Supplement'], 0,
  'CREMCAL SUSP 200 ML', '30049099', 0.05, 131, 'Suspension', 'Oral',
  '200 ML', 'BOTTLE', 'Calcium Carbonate 625 mg + Magnesium Hydroxide 75 mg + Zinc Gluconate 2 mg + Vitamin D3 200 I.U/5ml (ROSE WHITE FLAVOUR) (SUGAR FREE)', 'Calcium Carbonate 625 mg + Magnesium Hydroxide 75 mg + Zinc Gluconate 2 mg + Vitamin D3 200 I.U/5ml (ROSE WHITE FLAVOUR) (SUGAR FREE)', NULL,
  'Acidity, heartburn, stomach ulcers, and GERD', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CREMCAL TAB 10*15', 'Kidney stones, Gout, and Urinary Tract Infections (UTI)', 1443.7544, ARRAY['Nutritional Supplement'], 0,
  'CREMCAL TAB 10*15', '30045010', 0.05, 1640.63, 'Tablet', 'Oral',
  '10*15', 'STRIP', 'Calcium Citrate 1000 mg + Vitamin D3 250 IU + Zinc Sulphate 4 mg & Magnesium Hydroxide 100 mg', 'Calcium Citrate 1000 mg + Vitamin D3 250 IU + Zinc Sulphate 4 mg & Magnesium Hydroxide 100 mg', NULL,
  'Kidney stones, Gout, and Urinary Tract Infections (UTI)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CREMCAL-CC TAB 10*15', 'Nutritional supplement for bone health, nerve health, or immunity', 1196.2544, ARRAY['Nutritional Supplement'], 0,
  'CREMCAL-CC TAB 10*15', '30045090', 0.05, 1359.38, 'Tablet', 'Oral',
  '10*15', 'STRIP', 'Calcium Carbonate 1250 eq to Calcium 500 mg + Vit.D3 250 IU', 'Calcium Carbonate 1250 eq to Calcium 500 mg + Vit.D3 250 IU', NULL,
  'Nutritional supplement for bone health, nerve health, or immunity', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CREMCAL-CCM TAB 1*30', 'Kidney stones, Gout, and Urinary Tract Infections (UTI)', 206.2544, ARRAY['Nutritional Supplement'], 0,
  'CREMCAL-CCM TAB 1*30', '30049099', 0.05, 234.38, 'Tablet', 'Oral',
  '1*30', 'STRIP', 'Calcium Citrate Malate 250 mg + Vitamin D3 100 IU + Folic Acid 50 mcg', 'Calcium Citrate Malate 250 mg + Vitamin D3 100 IU + Folic Acid 50 mcg', NULL,
  'Kidney stones, Gout, and Urinary Tract Infections (UTI)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CREMCAL-K2 SG CAP 10*1*10', 'Kidney stones, Gout, and Urinary Tract Infections (UTI)', 2059.2, ARRAY['Skin Care'], 0,
  'CREMCAL-K2 SG CAP 10*1*10', '30045090', 0.05, 2340, 'Softgel Capsule', 'Oral',
  '10*1*10', 'STRIP', 'Calcitriol 0.25 mcg + Calcium Citrate Malate 500 mg + LMethylfolate 800 mcg + VIT K2 7 45 mcg + Methylcobalamin 1500 mcg + Zinc Oxide 7.5 mg + Magnesium Oxide 20 mg Softgel Capsules', 'Calcitriol 0.25 mcg + Calcium Citrate Malate 500 mg + LMethylfolate 800 mcg + VIT K2 7 45 mcg + Methylcobalamin 1500 mcg + Zinc Oxide 7.5 mg + Magnesium Oxide 20 mg Softgel Capsules', NULL,
  'Kidney stones, Gout, and Urinary Tract Infections (UTI)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CREMCAL-MAX SG CAP 10*1*15', 'Nutritional supplement for bone health, nerve health, or immunity', 3256, ARRAY['Skin Care'], 0,
  'CREMCAL-MAX SG CAP 10*1*15', '30049099', 0.05, 3700, 'Softgel Capsule', 'Oral',
  '10*1*15', 'STRIP', 'Calcitriol 0.25 mcg + Omega-3 Fatty Acids (EPA 180 mg & DHA 120 mg) + Methylcobalamin 1500 mcg + Folic Acid 400 mcg + Boron 1.5 mg + Calcium Carbonate 500 mg Softgel Capsules', 'Calcitriol 0.25 mcg + Omega-3 Fatty Acids (EPA 180 mg & DHA 120 mg) + Methylcobalamin 1500 mcg + Folic Acid 400 mcg + Boron 1.5 mg + Calcium Carbonate 500 mg Softgel Capsules', NULL,
  'Nutritional supplement for bone health, nerve health, or immunity', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CREMCAL-SG CAP 10*10', 'Nutritional supplement for bone health, nerve health, or immunity', 1155, ARRAY['Skin Care'], 0,
  'CREMCAL-SG CAP 10*10', '30045090', 0.05, 1312.5, 'Softgel Capsule', 'Oral',
  '10*10', 'STRIP', 'Calcitriol 0.25 mcg + Calcium Carbonate 500 mg + Zinc 7.5 mg Softgel Capules', 'Calcitriol 0.25 mcg + Calcium Carbonate 500 mg + Zinc 7.5 mg Softgel Capules', '~130–170 g',
  'Nutritional supplement for bone health, nerve health, or immunity', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CREMCAL-XT TAB 10*15', 'Nutritional supplement for bone health, nerve health, or immunity', 3217.5, ARRAY['Nutritional Supplement'], 0,
  'CREMCAL-XT TAB 10*15', '30045010', 0.05, 3656.25, 'Tablet', 'Oral',
  '10*15', 'STRIP', 'Calcium Carbonate 1250 mg + Vitamin D3 2000 IU + Methylcobalamin 1500 mcg + L-Methylfolate Calcium 1 mg + Pyridoxal 5-Phosphate 0.5 mg', 'Calcium Carbonate 1250 mg + Vitamin D3 2000 IU + Methylcobalamin 1500 mcg + L-Methylfolate Calcium 1 mg + Pyridoxal 5-Phosphate 0.5 mg', NULL,
  'Nutritional supplement for bone health, nerve health, or immunity', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CYSFERT-M PLUS TAB 10*1*10', 'Nutritional supplement for bone health, nerve health, or immunity', 2805, ARRAY['Cardiac / Diabetes Care'], 0,
  'CYSFERT-M PLUS TAB 10*1*10', '30049099', 0.05, 3187.5, 'Tablet', 'Oral',
  '10*1*10', 'STRIP', 'Myo-Inositol 550 mg + D-Chiro-Inositol 13.8 mg + Metformin Hydrochloride 500 mg + L-Methylfolate Calcium 0.5 mg + Mecobalamin 750 mcg', 'Myo-Inositol 550 mg + D-Chiro-Inositol 13.8 mg + Metformin Hydrochloride 500 mg + L-Methylfolate Calcium 0.5 mg + Mecobalamin 750 mcg', NULL,
  'Nutritional supplement for bone health, nerve health, or immunity', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('CYSFERT-PLUS TAB 10*1*10', 'Management of PCOS (Polycystic Ovary Syndrome) and hormonal balance', 2819.52, ARRAY['Nutritional Supplement'], 0,
  'CYSFERT-PLUS TAB 10*1*10', '21069099', 0.05, 3204, 'Tablet', 'Oral',
  '10*1*10', 'STRIP', 'Myo-Inositol 1100 mg + N-Acetyl Cysteine 50 mg + Inositol 13.8 mg + Vitamin D2 300 IU + Melatonin 1.5 mg + Chromium Picolinate 200 mcg + Selenium 20 mcg + Cyanocobalamin 0.5 mcg + L-Methyl folate 400 mcg', 'Myo-Inositol 1100 mg + N-Acetyl Cysteine 50 mg + Inositol 13.8 mg + Vitamin D2 300 IU + Melatonin 1.5 mg + Chromium Picolinate 200 mcg + Selenium 20 mcg + Cyanocobalamin 0.5 mcg + L-Methyl folate 400 mcg', NULL,
  'Management of PCOS (Polycystic Ovary Syndrome) and hormonal balance', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('DECKBIL-20 TAB 10*10', 'Allergic conditions (sneezing, runny nose, itchy eyes), Allergic Rhinitis, and Asthma', 1468.5, ARRAY['General / Other Care'], 0,
  'DECKBIL-20 TAB 10*10', '30049099', 0.05, 1668.75, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Bilastine 20 mg', 'Bilastine 20 mg', '~130–170 g',
  'Allergic conditions (sneezing, runny nose, itchy eyes), Allergic Rhinitis, and Asthma', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('DECKBIL-M TAB 10*10', 'Allergic conditions (sneezing, runny nose, itchy eyes), Allergic Rhinitis, and Asthma', 1716, ARRAY['Respiratory Care'], 0,
  'DECKBIL-M TAB 10*10', '30049039', 0.05, 1950, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Bilastine 20 mg + Montelukast 10 mg', 'Bilastine 20 mg + Montelukast 10 mg', '~130–170 g',
  'Allergic conditions (sneezing, runny nose, itchy eyes), Allergic Rhinitis, and Asthma', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('DEWSIGHT EYE DROPS 10 ML', 'Used for various medical conditions; consult a physician for specific use.', 115.588, ARRAY['Eye/Ear/Nasal Care'], 0,
  'DEWSIGHT EYE DROPS 10 ML', '30049099', 0.05, 131.35, 'Eye drop', 'topical',
  '10 ML', 'PLASTIC BOTTLE', 'Sodium Carboxymethylcellulose 0.5% w/v + Stabilized Oxychloro Complex 0.005% w/v', 'Sodium Carboxymethylcellulose 0.5% w/v + Stabilized Oxychloro Complex 0.005% w/v', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('DICMOLIN GEL 30 GM', 'Pain relief, inflammation, muscle spasms, and fever', 90.64, ARRAY['Skin Care'], 0,
  'DICMOLIN GEL 30 GM', '30041090', 0.05, 103, 'Gel', 'topical',
  '30 GM', 'TUBE', 'Diclofenac Sodium 1% w/w + Linseed Oil 3% + Methyl Salicylate 10% w/w + Menthol 5% w/w Gel', 'Diclofenac Sodium 1% w/w + Linseed Oil 3% + Methyl Salicylate 10% w/w + Menthol 5% w/w Gel', NULL,
  'Pain relief, inflammation, muscle spasms, and fever', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('DICMOLIN INJ 10*1ML', 'Pain relief, inflammation, muscle spasms, and fever', 14.8544, ARRAY['Pain / Muscle Care'], 0,
  'DICMOLIN INJ 10*1ML', '30049069', 0.05, 16.88, 'Injection', 'IV',
  '10*1ML', 'VIAL', 'Diclofenac Sodium 75 mg + Benzyl Alcohol 4% v/v', 'Diclofenac Sodium 75 mg + Benzyl Alcohol 4% v/v', NULL,
  'Pain relief, inflammation, muscle spasms, and fever', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('DICMOLIN MR TAB 10*10', 'Pain relief, inflammation, muscle spasms, and fever', 800.8, ARRAY['Pain / Muscle Care'], 0,
  'DICMOLIN MR TAB 10*10', '30049069', 0.05, 910, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Diclofenac Potassium 50 mg + Paracetamol 325 mg + Chlorzoxazone 250 mg', 'Diclofenac Potassium 50 mg + Paracetamol 325 mg + Chlorzoxazone 250 mg', '~130–170 g',
  'Pain relief, inflammation, muscle spasms, and fever', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('DICMOLIN ROLL ON 60 GM', 'Pain relief, inflammation, muscle spasms, and fever', 138.6, ARRAY['Skin Care'], 0,
  'DICMOLIN ROLL ON 60 GM', '30049034', 0.05, 157.5, 'Roll On', 'topical',
  '60 GM', 'PLASTIC BOTTLE', 'Diclofenac Sodium 3% w/w + Methyl Salicylate 10% w/w + Menthol 5 % w/w + Lignocaine HCL 1% + Linseed Oil 2% w/w Gel', 'Diclofenac Sodium 3% w/w + Methyl Salicylate 10% w/w + Menthol 5 % w/w + Lignocaine HCL 1% + Linseed Oil 2% w/w Gel', NULL,
  'Pain relief, inflammation, muscle spasms, and fever', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('DICMOLIN-P TAB 10*2*10', 'Pain relief, inflammation, muscle spasms, and fever', 643.5, ARRAY['Skin Care'], 0,
  'DICMOLIN-P TAB 10*2*10', '30049099', 0.05, 731.25, 'Tablet', 'Oral',
  '10*2*10', 'STRIP', 'Diclofenac Sodium 3% w/w + Methyl Salicylate 10% w/w + Menthol 5 % w/w + Lignocaine HCL 1% + Linseed Oil 2% w/w Gel', 'Diclofenac Sodium 3% w/w + Methyl Salicylate 10% w/w + Menthol 5 % w/w + Lignocaine HCL 1% + Linseed Oil 2% w/w Gel', NULL,
  'Pain relief, inflammation, muscle spasms, and fever', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('DICMOLIN-SP TAB 10*10', 'Pain relief, inflammation, muscle spasms, and fever', 721.6, ARRAY['Pain / Muscle Care'], 0,
  'DICMOLIN-SP TAB 10*10', '30049069', 0.05, 820, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Diclofenac Potassium 50 mg + Paracetamol 325 mg + Serratiopeptidase 10 mg', 'Diclofenac Potassium 50 mg + Paracetamol 325 mg + Serratiopeptidase 10 mg', '~130–170 g',
  'Pain relief, inflammation, muscle spasms, and fever', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('DOXBITE-100 DRY SYP 15GM/30ML', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 156.64000000000001, ARRAY['Infection Care'], 0,
  'DOXBITE-100 DRY SYP 15GM/30ML', '30042039', 0.05, 178, 'Dry syrup', 'Oral',
  '15GM/30ML', 'GLASS BOTTLE', 'Cefpodoxime Proxetil 100 mg/5ml (Sterile Water)', 'Cefpodoxime Proxetil 100 mg/5ml (Sterile Water)', NULL,
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('DOXBITE-100 DT TAB 10*10', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 1278.7544, ARRAY['Infection Care'], 0,
  'DOXBITE-100 DT TAB 10*10', '30042019', 0.05, 1453.13, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Cefpodoxime Proxetil 100 mg (Dispersible)', 'Cefpodoxime Proxetil 100 mg (Dispersible)', '~130–170 g',
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('DOXBITE-200 DT TAB 10*10', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 2156, ARRAY['Infection Care'], 0,
  'DOXBITE-200 DT TAB 10*10', '30042019', 0.05, 2450, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Cefpodoxime Proxetil 200 mg (Dispersible)', 'Cefpodoxime Proxetil 200 mg (Dispersible)', '~130–170 g',
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('DOXBITE-50 DRY SYP 15GM/30ML', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 94.864, ARRAY['Infection Care'], 0,
  'DOXBITE-50 DRY SYP 15GM/30ML', '30042039', 0.05, 107.8, 'Dry syrup', 'Oral',
  '15GM/30ML', 'GLASS BOTTLE', 'Cefpodoxime Proxetil 50mg/5ml (Sterile Water)', 'Cefpodoxime Proxetil 50mg/5ml (Sterile Water)', NULL,
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('DOXBITE-CV 100 DRY SYP 4G/30ML', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 172.4272, ARRAY['Infection Care'], 0,
  'DOXBITE-CV 100 DRY SYP 4G/30ML', '30042019', 0.05, 195.94, 'Dry syrup', 'Oral',
  '4G/30ML', 'GLASS BOTTLE', 'Cefpodoxime Proxetil 100 mg/5ml (Sterile Water)', 'Cefpodoxime Proxetil 100 mg/5ml (Sterile Water)', NULL,
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('DOXBITE-CV 50 DRY SYP 3.6G/30ML', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 106.4272, ARRAY['Infection Care'], 0,
  'DOXBITE-CV 50 DRY SYP 3.6G/30ML', '30042019', 0.05, 120.94, 'Dry syrup', 'Oral',
  '3.6G/30ML', 'GLASS BOTTLE', 'Cefpodoxime Proxetil 50mg/5ml (Sterile Water)', 'Cefpodoxime Proxetil 50mg/5ml (Sterile Water)', NULL,
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('DOXBITE-CV TAB 10*1*6', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 1731.84, ARRAY['Infection Care'], 0,
  'DOXBITE-CV TAB 10*1*6', '30042019', 0.05, 1968, 'Tablet', 'Oral',
  '10*1*6', 'STRIP', 'Cefpodoxime Proxetil 200 mg + Potassium Clavulanate 125 mg', 'Cefpodoxime Proxetil 200 mg + Potassium Clavulanate 125 mg', NULL,
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('DRILOXIM-125 DRY SYP 5.4G/30ML', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 149.3272, ARRAY['General / Other Care'], 0,
  'DRILOXIM-125 DRY SYP 5.4G/30ML', '30042019', 0.05, 169.69, 'Dry syrup', 'Oral',
  '5.4G/30ML', 'GLASS BOTTLE', 'Cefuroxime Axetil 125 mg/5ml (Sterile Water)', 'Cefuroxime Axetil 125 mg/5ml (Sterile Water)', NULL,
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('DRILOXIM-250 TAB 3*10', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 792, ARRAY['General / Other Care'], 0,
  'DRILOXIM-250 TAB 3*10', '30049099', 0.05, 900, 'Tablet', 'Oral',
  '3*10', 'STRIP', 'Cefuroxime 250 mg', 'Cefuroxime 250 mg', NULL,
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('DRILOXIM-500 TAB 3*10', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 1423.1272000000001, ARRAY['General / Other Care'], 0,
  'DRILOXIM-500 TAB 3*10', '30049039', 0.05, 1617.19, 'Tablet', 'Oral',
  '3*10', 'STRIP', 'Cefuroxime 500 mg', 'Cefuroxime 500 mg', NULL,
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('DRILOXIM-CV TAB 10*1*10', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 5197.456, ARRAY['General / Other Care'], 0,
  'DRILOXIM-CV TAB 10*1*10', '30042019', 0.05, 5906.2, 'Tablet', 'Oral',
  '10*1*10', 'STRIP', 'Cefuroxime Axetil 500 mg + Potassium Clavulanate 125 mg', 'Cefuroxime Axetil 500 mg + Potassium Clavulanate 125 mg', NULL,
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('DRILPAIN OIL 60 ML', 'Used for various medical conditions; consult a physician for specific use.', 125.84, ARRAY['Pain / Muscle Care'], 0,
  'DRILPAIN OIL 60 ML', '30049011', 0.05, 143, 'Oil', 'topical',
  '60 ML', 'MINI BOTTLE', 'Pain Relief Oil', 'Pain Relief Oil', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('DRILPAIN-D TAB 10*10', 'Pain relief, inflammation, muscle spasms, and fever', 981.7544000000001, ARRAY['Pain / Muscle Care'], 0,
  'DRILPAIN-D TAB 10*10', '30049029', 0.05, 1115.63, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Aceclofenac 100 mg + Drotaverine Hydrochloride 80 mg', 'Aceclofenac 100 mg + Drotaverine Hydrochloride 80 mg', '~130–170 g',
  'Pain relief, inflammation, muscle spasms, and fever', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('DRILPAIN-MR TAB 10*10', 'Pain relief, inflammation, muscle spasms, and fever', 841.5, ARRAY['Pain / Muscle Care'], 0,
  'DRILPAIN-MR TAB 10*10', '30049069', 0.05, 956.25, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Aceclofenac 100 mg + Paracetamol 325 mg + Chlorzoxazone 250 mg', 'Aceclofenac 100 mg + Paracetamol 325 mg + Chlorzoxazone 250 mg', '~130–170 g',
  'Pain relief, inflammation, muscle spasms, and fever', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('DRILPAIN-P TAB(ALU-ALU) 10*10', 'Pain relief, inflammation, muscle spasms, and fever', 478.5, ARRAY['Pain / Muscle Care'], 0,
  'DRILPAIN-P TAB(ALU-ALU) 10*10', '30049099', 0.05, 543.75, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Aceclofenac 100 mg + Paracetamol 325 mg', 'Aceclofenac 100 mg + Paracetamol 325 mg', NULL,
  'Pain relief, inflammation, muscle spasms, and fever', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('DRILPAIN-P TAB(BLISTER) 10*10', 'Pain relief, inflammation, muscle spasms, and fever', 475.2, ARRAY['Pain / Muscle Care'], 0,
  'DRILPAIN-P TAB(BLISTER) 10*10', '30049099', 0.05, 540, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Aceclofenac 100 mg + Paracetamol 325 mg', 'Aceclofenac 100 mg + Paracetamol 325 mg', NULL,
  'Pain relief, inflammation, muscle spasms, and fever', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('DRILPAIN-PTH4 TAB 10*10', 'Pain relief, inflammation, muscle spasms, and fever', 2138.4, ARRAY['Pain / Muscle Care'], 0,
  'DRILPAIN-PTH4 TAB 10*10', '30049069', 0.05, 2430, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Aceclofenac 100 mg + Paracetamol 325 mg + Thiocolchicoside 4 mg', 'Aceclofenac 100 mg + Paracetamol 325 mg + Thiocolchicoside 4 mg', '~130–170 g',
  'Pain relief, inflammation, muscle spasms, and fever', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('DRILPAIN-RB CAP 10*10', 'Acidity, heartburn, stomach ulcers, and GERD', 1012, ARRAY['Digestive Care'], 0,
  'DRILPAIN-RB CAP 10*10', '30049039', 0.05, 1150, 'Capsule', 'Oral',
  '10*10', 'STRIP', 'Rabeprazole Sodium 20 mg + Aceclofenac 200 mg SR Capsules', 'Rabeprazole Sodium 20 mg + Aceclofenac 200 mg SR Capsules', '~130–170 g',
  'Acidity, heartburn, stomach ulcers, and GERD', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('DRILPAIN-SP TAB 10*10', 'Pain relief, inflammation, muscle spasms, and fever', 1029.6, ARRAY['Pain / Muscle Care'], 0,
  'DRILPAIN-SP TAB 10*10', '30049099', 0.05, 1170, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Aceclofenac 100 mg + Paracetamol 325 mg + Serratiopeptidase 15 mg', 'Aceclofenac 100 mg + Paracetamol 325 mg + Serratiopeptidase 15 mg', '~130–170 g',
  'Pain relief, inflammation, muscle spasms, and fever', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('DRILPAIN-TH8 TAB 10*10', 'Pain relief, inflammation, muscle spasms, and fever', 2805, ARRAY['Pain / Muscle Care'], 0,
  'DRILPAIN-TH8 TAB 10*10', '30049069', 0.05, 3187.5, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Aceclofenac 100 mg + Thiocolchicoside 8 mg', 'Aceclofenac 100 mg + Thiocolchicoside 8 mg', '~130–170 g',
  'Pain relief, inflammation, muscle spasms, and fever', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('DRILSPAS-DS TAB 10*10', 'Used for various medical conditions; consult a physician for specific use.', 742.5, ARRAY['General / Other Care'], 0,
  'DRILSPAS-DS TAB 10*10', '300490', 0.05, 843.75, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Drotaverine Hydrochloride 80 mg', 'Drotaverine Hydrochloride 80 mg', '~130–170 g',
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('DRIPNASE DROPS 15 ML', 'Pain relief, inflammation, muscle spasms, and fever', 70.95439999999999, ARRAY['Respiratory Care'], 0,
  'DRIPNASE DROPS 15 ML', '30049099', 0.05, 80.63, 'Drops', 'Oral',
  '15 ML', 'MINI BOTTLE', 'Paracetamol 125 mg + Phenylephrine Hydrochloride 2.5 mg + Chlorpheniramine Maleate 1 mg', 'Paracetamol 125 mg + Phenylephrine Hydrochloride 2.5 mg + Chlorpheniramine Maleate 1 mg', NULL,
  'Pain relief, inflammation, muscle spasms, and fever', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('DRIPNASE NASAL SPRAY 10 ML', 'Used for various medical conditions; consult a physician for specific use.', 46.64, ARRAY['Eye/Ear/Nasal Care'], 0,
  'DRIPNASE NASAL SPRAY 10 ML', '30049099', 0.05, 53, 'Nasal Spray', 'topical',
  '10 ML', 'MINI BOTTLE', 'Xylometazoline HCL 0.1% Nasal Spray', 'Xylometazoline HCL 0.1% Nasal Spray', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('DRIPNASE-AM TAB 10*10', 'Pain relief, inflammation, muscle spasms, and fever', 633.6, ARRAY['Respiratory Care'], 0,
  'DRIPNASE-AM TAB 10*10', '30049099', 0.05, 720, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Paracetamol 325 mg + Phenylephrine Hydrochloride 5 mg + Guaiphenesin 50 mg + Cetirizine Hydrochloride 5 mg + Ambroxol Hydrochloride 15 mg', 'Paracetamol 325 mg + Phenylephrine Hydrochloride 5 mg + Guaiphenesin 50 mg + Cetirizine Hydrochloride 5 mg + Ambroxol Hydrochloride 15 mg', '~130–170 g',
  'Pain relief, inflammation, muscle spasms, and fever', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('DRIPNASE-KID NASAL SPRAY 10 ML', 'Used for various medical conditions; consult a physician for specific use.', 38.711200000000005, ARRAY['Eye/Ear/Nasal Care'], 0,
  'DRIPNASE-KID NASAL SPRAY 10 ML', '30049099', 0.05, 43.99, 'Nasal Spray', 'topical',
  '10 ML', 'MINI BOTTLE', 'Xylometazoline HCL 0.05% Nasal spray', 'Xylometazoline HCL 0.05% Nasal spray', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('DRIPNASE-MIST NASAL SPRAY 100 ML', 'Used for various medical conditions; consult a physician for specific use.', 438.9, ARRAY['Eye/Ear/Nasal Care'], 0,
  'DRIPNASE-MIST NASAL SPRAY 100 ML', '30049099', 0.05, 498.75, 'Nasal Spray', 'topical',
  '100 ML', 'MINI BOTTLE', 'Sodium Chloride 0.9% w/v & Benzalkonium Chloride 0.02% w/v (Isotonic Nasal Spray)', 'Sodium Chloride 0.9% w/v & Benzalkonium Chloride 0.02% w/v (Isotonic Nasal Spray)', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('DRIPNASE-NC TAB 10*10', 'Pain relief, inflammation, muscle spasms, and fever', 561, ARRAY['Respiratory Care'], 0,
  'DRIPNASE-NC TAB 10*10', '30049069', 0.05, 637.5, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Nimesulide 100 mg + Phenylephrine Hydrochloride 10 mg + Caffeine 30 mg + Cetirizine Dihydrochloride 5 mg', 'Nimesulide 100 mg + Phenylephrine Hydrochloride 10 mg + Caffeine 30 mg + Cetirizine Dihydrochloride 5 mg', '~130–170 g',
  'Pain relief, inflammation, muscle spasms, and fever', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('DRIPNASE-P DS SUSP 60 ML', 'Pain relief, inflammation, muscle spasms, and fever', 66, ARRAY['Respiratory Care'], 0,
  'DRIPNASE-P DS SUSP 60 ML', '30049093', 0.05, 75, 'Suspension', 'Oral',
  '60 ML', 'BOTTLE', 'Paracetamol 250 mg + Phenylephrine Hydrochloride 5 mg + Chlorpheniramine Maleate 2 mg', 'Paracetamol 250 mg + Phenylephrine Hydrochloride 5 mg + Chlorpheniramine Maleate 2 mg', NULL,
  'Pain relief, inflammation, muscle spasms, and fever', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('DRIPNASE-S NASAL SPRAY 10 ML', 'Used for various medical conditions; consult a physician for specific use.', 56.9272, ARRAY['Eye/Ear/Nasal Care'], 0,
  'DRIPNASE-S NASAL SPRAY 10 ML', '30049099', 0.05, 64.69, 'Nasal Spray', 'topical',
  '10 ML', 'MINI BOTTLE', 'Sodium Chloride 0.65% w/v & Benzalkonium Chloride 0.01% w/v Nasal Spray', 'Sodium Chloride 0.65% w/v & Benzalkonium Chloride 0.01% w/v Nasal Spray', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('DRIPNASE-S NASAL SPRAY 20 ML', 'Used for various medical conditions; consult a physician for specific use.', 110, ARRAY['Eye/Ear/Nasal Care'], 0,
  'DRIPNASE-S NASAL SPRAY 20 ML', '30049099', 0.05, 125, 'Nasal Spray', 'topical',
  '20 ML', 'MINI BOTTLE', 'Sodium Chloride 0.65% w/v & Benzalkonium Chloride 0.01% w/v Nasal Spray', 'Sodium Chloride 0.65% w/v & Benzalkonium Chloride 0.01% w/v Nasal Spray', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('DRIPNASE-TRIO TAB 10*10', 'Pain relief, inflammation, muscle spasms, and fever', 616, ARRAY['Respiratory Care'], 0,
  'DRIPNASE-TRIO TAB 10*10', '30049099', 0.05, 700, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Paracetamol 500 mg + Phenylephrine Hydrochloride 10 mg + Chlorpheniramine Maleate 2 mg', 'Paracetamol 500 mg + Phenylephrine Hydrochloride 10 mg + Chlorpheniramine Maleate 2 mg', '~130–170 g',
  'Pain relief, inflammation, muscle spasms, and fever', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('DUCKLIV SYP 100 ML 100 ML', 'Used for various medical conditions; consult a physician for specific use.', 66, ARRAY['General / Other Care'], 0,
  'DUCKLIV SYP 100 ML 100 ML', '30049011', 0.05, 75, 'Syrup', 'Oral',
  '100 ML', 'BOTTLE', 'Herbal Liver Tonic', 'Herbal Liver Tonic', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('DUCKLIV SYP 225 ML', 'Used for various medical conditions; consult a physician for specific use.', 115.28, ARRAY['General / Other Care'], 0,
  'DUCKLIV SYP 225 ML', '30049011', 0.05, 131, 'Syrup', 'Oral',
  '225 ML', 'BOTTLE', 'Herbal Liver Tonic', 'Herbal Liver Tonic', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('DUCKLIV-5G SYP 225 ML', 'Used for various medical conditions; consult a physician for specific use.', 136.1272, ARRAY['General / Other Care'], 0,
  'DUCKLIV-5G SYP 225 ML', '30049011', 0.05, 154.69, 'Syrup', 'Oral',
  '225 ML', 'BOTTLE', '5G Herbal Liver Tonic', '5G Herbal Liver Tonic', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('DUCKLIV-DS TAB 30 TAB', 'Used for various medical conditions; consult a physician for specific use.', 211.2, ARRAY['General / Other Care'], 0,
  'DUCKLIV-DS TAB 30 TAB', '30049011', 0.05, 240, 'Tablet', 'Oral',
  '30 TAB', 'JAR', 'Herbal Liver Tablets', 'Herbal Liver Tablets', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('ECHOBID NASAL SPRAY 10 ML', 'Used for various medical conditions; consult a physician for specific use.', 296.1728, ARRAY['Skin Care'], 0,
  'ECHOBID NASAL SPRAY 10 ML', '30049099', 0.05, 336.56, 'Nasal Spray', 'topical',
  '10 ML', 'MINI BOTTLE', 'Mometasone Furoate 50 mcg Nasal Spray', 'Mometasone Furoate 50 mcg Nasal Spray', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('ECHOBID SYP 60 ML 60 ML', 'Cough, Asthma, COPD, and Bronchitis', 49.5, ARRAY['Respiratory Care'], 0,
  'ECHOBID SYP 60 ML 60 ML', '30049091', 0.05, 56.25, 'Syrup', 'Oral',
  '60 ML', 'MINI BOTTLE', 'Ambroxol Hydrochloride 15 mg, Guaiphenesin 50 mg, Terbutaline Sulphate 1.25 mg & Menthol 1.5 mg', 'Ambroxol Hydrochloride 15 mg, Guaiphenesin 50 mg, Terbutaline Sulphate 1.25 mg & Menthol 1.5 mg', NULL,
  'Cough, Asthma, COPD, and Bronchitis', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('ECHOBID SYRUP 100 ML', 'Cough, Asthma, COPD, and Bronchitis', 86.6272, ARRAY['Respiratory Care'], 0,
  'ECHOBID SYRUP 100 ML', '30049039', 0.05, 98.44, 'Syrup', 'Oral',
  '100 ML', 'BOTTLE', 'Ambroxol Hydrochloride 15 mg, Guaiphenesin 50 mg & Terbutaline Sulphate 1.25 mg', 'Ambroxol Hydrochloride 15 mg, Guaiphenesin 50 mg & Terbutaline Sulphate 1.25 mg', NULL,
  'Cough, Asthma, COPD, and Bronchitis', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('ECHOBID-100 CAP 10*10', 'Cough, Asthma, COPD, and Bronchitis', 1155, ARRAY['General / Other Care'], 0,
  'ECHOBID-100 CAP 10*10', '30049027', 0.05, 1312.5, 'Capsule', 'Oral',
  '10*10', 'STRIP', 'Acebrophylline 100 mg', 'Acebrophylline 100 mg', '~130–170 g',
  'Cough, Asthma, COPD, and Bronchitis', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('ECHOBID-ACE TAB 10*10', 'Cough, Asthma, COPD, and Bronchitis', 1608.7544, ARRAY['General / Other Care'], 0,
  'ECHOBID-ACE TAB 10*10', '30049099', 0.05, 1828.13, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Acebrophylline 100 mg + Acetylcysteine 600 mg', 'Acebrophylline 100 mg + Acetylcysteine 600 mg', '~130–170 g',
  'Cough, Asthma, COPD, and Bronchitis', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('ECHOBID-AM TAB 10*10', 'Cough, Asthma, COPD, and Bronchitis', 1144, ARRAY['Respiratory Care'], 0,
  'ECHOBID-AM TAB 10*10', '30049099', 0.05, 1300, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Acetylcysteine 300 mg & Ambroxol HCl 30 mg Tabletes', 'Acetylcysteine 300 mg & Ambroxol HCl 30 mg Tabletes', '~130–170 g',
  'Cough, Asthma, COPD, and Bronchitis', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('ECHOBID-JUNIOR SYP 60 ML', 'Cough, Asthma, COPD, and Bronchitis', 70.1272, ARRAY['Respiratory Care'], 0,
  'ECHOBID-JUNIOR SYP 60 ML', '30049039', 0.05, 79.69, 'Syrup', 'Oral',
  '60 ML', 'BOTTLE', 'Ambroxol Hydrochloride 15 mg + Guaiphenesin 50 mg & Levosalbutamol Sulphate 0.5 mg', 'Ambroxol Hydrochloride 15 mg + Guaiphenesin 50 mg & Levosalbutamol Sulphate 0.5 mg', NULL,
  'Cough, Asthma, COPD, and Bronchitis', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('ECHOBID-LC SYRUP 100 ML', 'Used for various medical conditions; consult a physician for specific use.', 156.7544, ARRAY['General / Other Care'], 0,
  'ECHOBID-LC SYRUP 100 ML', '30049039', 0.05, 178.13, 'Syrup', 'Oral',
  '100 ML', 'BOTTLE', 'Levocloperastine Fendizoate 35.4 mg & Chlorpheniramine Maleate 4 mg', 'Levocloperastine Fendizoate 35.4 mg & Chlorpheniramine Maleate 4 mg', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('ECHOBID-LS DROPS 15 ML', 'Cough, Asthma, COPD, and Bronchitis', 56.9272, ARRAY['Respiratory Care'], 0,
  'ECHOBID-LS DROPS 15 ML', '30049099', 0.05, 64.69, 'Drops', 'Oral',
  '15 ML', 'MINI BOTTLE', 'Levosalbutamol 0.25 mg + Ambroxol Hydrochloride 7.5 mg + Guaiphenesin 12.5 mg', 'Levosalbutamol 0.25 mg + Ambroxol Hydrochloride 7.5 mg + Guaiphenesin 12.5 mg', NULL,
  'Cough, Asthma, COPD, and Bronchitis', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('ECHOBID-LS SYP 60 ML 60 ML', 'Cough, Asthma, COPD, and Bronchitis', 58.96, ARRAY['Respiratory Care'], 0,
  'ECHOBID-LS SYP 60 ML 60 ML', '30049099', 0.05, 67, 'Syrup', 'Oral',
  '60 ML', 'BOTTLE', 'Ambroxol HCL 30 mg + Guaiphenesin 50 mg & Levosalbutamol Sulphate 1 mg', 'Ambroxol HCL 30 mg + Guaiphenesin 50 mg & Levosalbutamol Sulphate 1 mg', NULL,
  'Cough, Asthma, COPD, and Bronchitis', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('ECHOBID-LS SYRUP 100 ML', 'Cough, Asthma, COPD, and Bronchitis', 97.68, ARRAY['Respiratory Care'], 0,
  'ECHOBID-LS SYRUP 100 ML', '30049039', 0.05, 111, 'Syrup', 'Oral',
  '100 ML', 'BOTTLE', 'Ambroxol HCL 30 mg + Guaiphenesin 50 mg & Levosalbutamol Sulphate 1 mg', 'Ambroxol HCL 30 mg + Guaiphenesin 50 mg & Levosalbutamol Sulphate 1 mg', NULL,
  'Cough, Asthma, COPD, and Bronchitis', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('ECHOTUSS-D  SYP 60 ML', 'Cough, Asthma, COPD, and Bronchitis', 55.44, ARRAY['Respiratory Care'], 0,
  'ECHOTUSS-D  SYP 60 ML', '30049031', 0.05, 63, 'Syrup', 'Oral',
  '60 ML', 'BOTTLE', 'Dextromethorphan 10 mg + CPM 2 mg + Phenylephrine 5 mg', 'Dextromethorphan 10 mg + CPM 2 mg + Phenylephrine 5 mg', NULL,
  'Cough, Asthma, COPD, and Bronchitis', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('ECHOTUSS-DX SYRUP 100 ML', 'Cough, Asthma, COPD, and Bronchitis', 102.3, ARRAY['Respiratory Care'], 0,
  'ECHOTUSS-DX SYRUP 100 ML', '30049099', 0.05, 116.25, 'Syrup', 'Oral',
  '100 ML', 'BOTTLE', 'Dextromethorphan 10 mg + Ambroxol 15 mg + CPM 2 mg + Phenylephrine 5 mg + Menthol 1.5 mg', 'Dextromethorphan 10 mg + Ambroxol 15 mg + CPM 2 mg + Phenylephrine 5 mg + Menthol 1.5 mg', NULL,
  'Cough, Asthma, COPD, and Bronchitis', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('ECLODEC CREAM 15 GM', 'Used for various medical conditions; consult a physician for specific use.', 72.6, ARRAY['Skin Care'], 0,
  'ECLODEC CREAM 15 GM', '30049099', 0.05, 82.5, 'Cream', 'topical',
  '15 GM', 'TUBE', 'Beclomethasone Dipropionate 0.025% w/w + Neomycin Sulphate 0.50% w/w + Miconazole Nitrate 2.0% w/w Cream', 'Beclomethasone Dipropionate 0.025% w/w + Neomycin Sulphate 0.50% w/w + Miconazole Nitrate 2.0% w/w Cream', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('ENTERFAX-400 TAB 10*10', 'Used for various medical conditions; consult a physician for specific use.', 3217.5, ARRAY['General / Other Care'], 0,
  'ENTERFAX-400 TAB 10*10', '30049099', 0.05, 3656.25, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Rifaximin 400 mg', 'Rifaximin 400 mg', '~130–170 g',
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('EPILATOR-500 TAB 10*10', 'Used for various medical conditions; consult a physician for specific use.', 1220.56, ARRAY['General / Other Care'], 0,
  'EPILATOR-500 TAB 10*10', '30049099', 0.05, 1387, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Levetiracetam 500 mg', 'Levetiracetam 500 mg', '~130–170 g',
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('ESTRONOT TAB 10*1*28', 'Used for various medical conditions; consult a physician for specific use.', 3960, ARRAY['General / Other Care'], 0,
  'ESTRONOT TAB 10*1*28', '30045090', 0.05, 4500, 'Tablet', 'Oral',
  '10*1*28', 'STRIP', 'Estradiol Valerate 2 mg', 'Estradiol Valerate 2 mg', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('EVENZULA CREAM 15 GM', 'Used for various medical conditions; consult a physician for specific use.', 152.6272, ARRAY['Skin Care'], 0,
  'EVENZULA CREAM 15 GM', '30049099', 0.05, 173.44, 'Cream', 'topical',
  '15 GM', 'TUBE', 'Hydroquinone 2.0% w/w + Tretinoin 0.025% w/w + Mometasone Furoate 0.1% w/w Cream', 'Hydroquinone 2.0% w/w + Tretinoin 0.025% w/w + Mometasone Furoate 0.1% w/w Cream', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('EVESBOON TAB 10*1*10', 'Used for various medical conditions; consult a physician for specific use.', 5610, ARRAY['General / Other Care'], 0,
  'EVESBOON TAB 10*1*10', '30043919', 0.05, 6375, 'Tablet', 'Oral',
  '10*1*10', 'STRIP', 'Dydrogesterone 10 mg', 'Dydrogesterone 10 mg', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('EVESFEN SG CAP 10*1*1', 'Used for various medical conditions; consult a physician for specific use.', 1724.8, ARRAY['General / Other Care'], 0,
  'EVESFEN SG CAP 10*1*1', '30045090', 0.05, 1960, 'Softgel Capsule', 'Oral',
  '10*1*1', 'STRIP', 'Fenticonazole Nitrate 600 mg Vaginal Capsules', 'Fenticonazole Nitrate 600 mg Vaginal Capsules', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('EXCELACT GRANULES 200 GM', 'Used for various medical conditions; consult a physician for specific use.', 374, ARRAY['General / Other Care'], 0,
  'EXCELACT GRANULES 200 GM', '30049011', 0.05, 425, 'Granules', 'Oral',
  '200 GM', 'JAR', 'Lactation Granules ( Shatavari Roots, Vidarikand Tuber, Sowa Tuber, Gokshur Panchang Fruits, Yashtimadhu Roots, Safed Jeera Seeds, Powder of Aliv Seeds ) (Elaichi Flavour)', 'Lactation Granules ( Shatavari Roots, Vidarikand Tuber, Sowa Tuber, Gokshur Panchang Fruits, Yashtimadhu Roots, Safed Jeera Seeds, Powder of Aliv Seeds ) (Elaichi Flavour)', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('EXITRON DROPS 30 ML', 'Used for various medical conditions; consult a physician for specific use.', 35.4728, ARRAY['General / Other Care'], 0,
  'EXITRON DROPS 30 ML', '30049099', 0.05, 40.31, 'Drops', 'Oral',
  '30 ML', 'MINI BOTTLE', 'Ondansetron Hydrochloride 2 mg/5 ml', 'Ondansetron Hydrochloride 2 mg/5 ml', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('EXITRON INJ 5*2 ML', 'Used for various medical conditions; consult a physician for specific use.', 11.941600000000001, ARRAY['General / Other Care'], 0,
  'EXITRON INJ 5*2 ML', '30045039', 0.05, 13.57, 'Injection', 'IV',
  '5*2 ML', 'VIAL', 'Ondansetron 2 mg/ml', 'Ondansetron 2 mg/ml', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('EXITRON-MD 4 TAB 10*10', 'Used for various medical conditions; consult a physician for specific use.', 473.5544, ARRAY['General / Other Care'], 0,
  'EXITRON-MD 4 TAB 10*10', '30049099', 0.05, 538.13, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Ondansetron 4 mg (Mouth Dissolving)', 'Ondansetron 4 mg (Mouth Dissolving)', '~130–170 g',
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('EXITRON-MD 8 TAB 10*10', 'Used for various medical conditions; consult a physician for specific use.', 816.7544, ARRAY['General / Other Care'], 0,
  'EXITRON-MD 8 TAB 10*10', '30049099', 0.05, 928.13, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Ondansetron 8 mg (Mouth Dissolving)', 'Ondansetron 8 mg (Mouth Dissolving)', '~130–170 g',
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('EXTECLIN-LB CAP 10*10', 'Used for various medical conditions; consult a physician for specific use.', 948.7544000000001, ARRAY['Infection Care'], 0,
  'EXTECLIN-LB CAP 10*10', '30041030', 0.05, 1078.13, 'Capsule', 'Oral',
  '10*10', 'STRIP', 'Doxycycline Hydrochloride 100 mg + Lactic Acid Bacillus', 'Doxycycline Hydrochloride 100 mg + Lactic Acid Bacillus', '~130–170 g',
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('FAROBYTE-200 TAB 10*1*6', 'Used for various medical conditions; consult a physician for specific use.', 5610, ARRAY['General / Other Care'], 0,
  'FAROBYTE-200 TAB 10*1*6', '30049099', 0.05, 6375, 'Tablet', 'Oral',
  '10*1*6', 'STRIP', 'Faropenem 200 mg', 'Faropenem 200 mg', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('FAROBYTE-300 ER TAB 10*1*6', 'Used for various medical conditions; consult a physician for specific use.', 6435, ARRAY['General / Other Care'], 0,
  'FAROBYTE-300 ER TAB 10*1*6', '30049099', 0.05, 7312.5, 'Tablet', 'Oral',
  '10*1*6', 'STRIP', 'Faropenem Extended Release Tablets 300 mg', 'Faropenem Extended Release Tablets 300 mg', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('FAROBYTE-50 DRY SYP 6G/30ML', 'Used for various medical conditions; consult a physician for specific use.', 198, ARRAY['General / Other Care'], 0,
  'FAROBYTE-50 DRY SYP 6G/30ML', '30042019', 0.05, 225, 'Dry syrup', 'Oral',
  '6G/30ML', 'GLASS BOTTLE', 'Faropenem Sodium Hydrate 50 mg/5 ml (Sterile Water)', 'Faropenem Sodium Hydrate 50 mg/5 ml (Sterile Water)', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('FAROBYTE-CV TAB 10*1*6', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 7012.5, ARRAY['General / Other Care'], 0,
  'FAROBYTE-CV TAB 10*1*6', '30049099', 0.05, 7968.75, 'Tablet', 'Oral',
  '10*1*6', 'STRIP', 'Faropenem Sodium Hydrate 200 mg + Potassium Clavulanate 125 mg', 'Faropenem Sodium Hydrate 200 mg + Potassium Clavulanate 125 mg', NULL,
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('FEBMATE 40 TAB 10*14', 'Used for various medical conditions; consult a physician for specific use.', 1501.5, ARRAY['General / Other Care'], 0,
  'FEBMATE 40 TAB 10*14', '30049099', 0.05, 1706.25, 'Tablet', 'Oral',
  '10*14', 'STRIP', 'Febuxostat 40 mg', 'Febuxostat 40 mg', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('FENAMOST-D TAB 10*10', 'Pain relief, inflammation, muscle spasms, and fever', 1023, ARRAY['Pain / Muscle Care'], 0,
  'FENAMOST-D TAB 10*10', '30049066', 0.05, 1162.5, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Mefenamic Acid 250 mg + Drotaverine Hydrochloride 80 mg', 'Mefenamic Acid 250 mg + Drotaverine Hydrochloride 80 mg', '~130–170 g',
  'Pain relief, inflammation, muscle spasms, and fever', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('FENAMOST-P DS SUSP 60 ML', 'Pain relief, inflammation, muscle spasms, and fever', 69.52, ARRAY['Pain / Muscle Care'], 0,
  'FENAMOST-P DS SUSP 60 ML', '30049099', 0.05, 79, 'Suspension', 'Oral',
  '60 ML', 'BOTTLE', 'Mefenamic Acid 100 mg + Paracetamol 250 mg', 'Mefenamic Acid 100 mg + Paracetamol 250 mg', NULL,
  'Pain relief, inflammation, muscle spasms, and fever', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('FENAMOST-P TAB 10*10', 'Pain relief, inflammation, muscle spasms, and fever', 536.2544, ARRAY['Pain / Muscle Care'], 0,
  'FENAMOST-P TAB 10*10', '300490', 0.05, 609.38, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Mefenamic Acid 500 mg + Paracetamol 325 mg', 'Mefenamic Acid 500 mg + Paracetamol 325 mg', '~130–170 g',
  'Pain relief, inflammation, muscle spasms, and fever', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('FLABSTOP-120 CAP 10*1*10', 'Used for various medical conditions; consult a physician for specific use.', 4042.5, ARRAY['General / Other Care'], 0,
  'FLABSTOP-120 CAP 10*1*10', '30049099', 0.05, 4593.75, 'Capsule', 'Oral',
  '10*1*10', 'STRIP', 'Orlistat 120 mg', 'Orlistat 120 mg', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('FLAZMOR-6 TAB 10*10', 'Used for various medical conditions; consult a physician for specific use.', 963.6, ARRAY['General / Other Care'], 0,
  'FLAZMOR-6 TAB 10*10', '30043200', 0.05, 1095, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Deflazacort 6 mg', 'Deflazacort 6 mg', '~130–170 g',
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('FLOSVECT-100 SUSP 60 ML', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 119.6272, ARRAY['Infection Care'], 0,
  'FLOSVECT-100 SUSP 60 ML', '30049099', 0.05, 135.94, 'Suspension', 'Oral',
  '60 ML', 'BOTTLE', 'Ofloxacin 100 mg', 'Ofloxacin 100 mg', NULL,
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('FLOSVECT-200 TAB 10*10', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 734.184, ARRAY['Infection Care'], 0,
  'FLOSVECT-200 TAB 10*10', '30042034', 0.05, 834.3, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Ofloxacin 200 mg', 'Ofloxacin 200 mg', '~130–170 g',
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('FLOSVECT-4 CREAM 15 GM', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 80.96, ARRAY['Skin Care'], 0,
  'FLOSVECT-4 CREAM 15 GM', '30049099', 0.05, 92, 'Cream', 'topical',
  '15 GM', 'TUBE', 'Itraconazole 1.0% + Ofloxacin 0.75% + Ornidazole 2.0% + Clobetasol Propionate 0.05% Cream', 'Itraconazole 1.0% + Ofloxacin 0.75% + Ornidazole 2.0% + Clobetasol Propionate 0.05% Cream', NULL,
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('FLOSVECT-50 SUSP 60 ML', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 64.3544, ARRAY['Infection Care'], 0,
  'FLOSVECT-50 SUSP 60 ML', '30049099', 0.05, 73.13, 'Suspension', 'Oral',
  '60 ML', 'BOTTLE', 'Ofloxacin 50 mg', 'Ofloxacin 50 mg', NULL,
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('FLOSVECT-BC EAR DROPS 5 ML', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 96.8, ARRAY['Skin Care'], 0,
  'FLOSVECT-BC EAR DROPS 5 ML', '30049099', 0.05, 110, 'Ear drops', 'topical',
  '5 ML', 'MINI BOTTLE', 'Ofloxacin 0.3% w/v + Beclomethasone Dipropionate 0.025% w/v + Clotrimazole 1% w/v + Glycerin 25% w/v + Lignocaine Hydrochloride 2% w/v', 'Ofloxacin 0.3% w/v + Beclomethasone Dipropionate 0.025% w/v + Clotrimazole 1% w/v + Glycerin 25% w/v + Lignocaine Hydrochloride 2% w/v', NULL,
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('FLOSVECT-MS SUSP 30ML 30 ML', 'Acidity, heartburn, stomach ulcers, and GERD', 52.8, ARRAY['Infection Care'], 0,
  'FLOSVECT-MS SUSP 30ML 30 ML', '30049099', 0.05, 60, 'Suspension', 'Oral',
  '30 ML', 'BOTTLE', 'Ofloxacin 50 mg + Metronidazole Benzoate 120 mg + Simethicone 10 mg', 'Ofloxacin 50 mg + Metronidazole Benzoate 120 mg + Simethicone 10 mg', NULL,
  'Acidity, heartburn, stomach ulcers, and GERD', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('FLOSVECT-MS SUSP 60 ML', 'Acidity, heartburn, stomach ulcers, and GERD', 70.1272, ARRAY['Infection Care'], 0,
  'FLOSVECT-MS SUSP 60 ML', '30049099', 0.05, 79.69, 'Suspension', 'Oral',
  '60 ML', 'BOTTLE', 'Ofloxacin 50 mg + Metronidazole Benzoate 100 mg + Simethicone 10 mg', 'Ofloxacin 50 mg + Metronidazole Benzoate 100 mg + Simethicone 10 mg', NULL,
  'Acidity, heartburn, stomach ulcers, and GERD', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('FLOSVECT-OZ TAB 10*10', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 1196.2544, ARRAY['Infection Care'], 0,
  'FLOSVECT-OZ TAB 10*10', '30042034', 0.05, 1359.38, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Ofloxacin 200 mg + Ornidazole 500 mg', 'Ofloxacin 200 mg + Ornidazole 500 mg', '~130–170 g',
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('GABROCK-D GEL 30 GM', 'Pain relief, inflammation, muscle spasms, and fever', 198, ARRAY['Skin Care'], 0,
  'GABROCK-D GEL 30 GM', '30049034', 0.05, 225, 'Gel', 'topical',
  '30 GM', 'TUBE', 'Diclofenac Diethylamine 1.16% w/w + Gabapentin 8% w/w + Methyl Salicylate 5% w/w + Menthol 5% w/w Gel', 'Diclofenac Diethylamine 1.16% w/w + Gabapentin 8% w/w + Methyl Salicylate 5% w/w + Menthol 5% w/w Gel', NULL,
  'Pain relief, inflammation, muscle spasms, and fever', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('GABROCK-M TAB 10*10', 'Nutritional supplement for bone health, nerve health, or immunity', 1353, ARRAY['Nutritional Supplement'], 0,
  'GABROCK-M TAB 10*10', '30049081', 0.05, 1537.5, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Gabapentin 300 mg + Methylcobalamin 500 mcg', 'Gabapentin 300 mg + Methylcobalamin 500 mcg', '~130–170 g',
  'Nutritional supplement for bone health, nerve health, or immunity', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('GABROCK-NT 100 TAB 10*10', 'Neuropathic pain (nerve pain) and Fibromyalgia', 907.5, ARRAY['General / Other Care'], 0,
  'GABROCK-NT 100 TAB 10*10', '30049081', 0.05, 1031.25, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Gabapentin 100 mg + Nortriptyline 10 mg', 'Gabapentin 100 mg + Nortriptyline 10 mg', '~130–170 g',
  'Neuropathic pain (nerve pain) and Fibromyalgia', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('GABROCK-NT 400 TAB 10*10', 'Neuropathic pain (nerve pain) and Fibromyalgia', 1732.5, ARRAY['General / Other Care'], 0,
  'GABROCK-NT 400 TAB 10*10', '30049081', 0.05, 1968.75, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Gabapentin 400 mg + Nortriptyline 10 mg', 'Gabapentin 400 mg + Nortriptyline 10 mg', '~130–170 g',
  'Neuropathic pain (nerve pain) and Fibromyalgia', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('GARANTID SYP 100 ML', 'Used for various medical conditions; consult a physician for specific use.', 105.6, ARRAY['General / Other Care'], 0,
  'GARANTID SYP 100 ML', '30049099', 0.05, 120, 'Syrup', 'Oral',
  '100 ML', 'BOTTLE', 'Ranitidine Hydrochloride 75 mg/5 ml', 'Ranitidine Hydrochloride 75 mg/5 ml', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('GASBEAT-RT TAB 10*10', 'Used for various medical conditions; consult a physician for specific use.', 871.2, ARRAY['General / Other Care'], 0,
  'GASBEAT-RT TAB 10*10', '30049099', 0.05, 990, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Clidinium Bromide 2.5 mg + Chlordiazepoxide 5 mg + Dicyclomine Hydrochloride 10 mg', 'Clidinium Bromide 2.5 mg + Chlordiazepoxide 5 mg + Dicyclomine Hydrochloride 10 mg', '~130–170 g',
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('GB-ALL 120 TAB 10*10', 'Allergic conditions (sneezing, runny nose, itchy eyes), Allergic Rhinitis, and Asthma', 1196.2544, ARRAY['Respiratory Care'], 0,
  'GB-ALL 120 TAB 10*10', '30049099', 0.05, 1359.38, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Fexofenadine 120 mg', 'Fexofenadine 120 mg', '~130–170 g',
  'Allergic conditions (sneezing, runny nose, itchy eyes), Allergic Rhinitis, and Asthma', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('GESPLAN TAB 2*5*10', 'Consult physician', 281.6, ARRAY['General / Other Care'], 0,
  'GESPLAN TAB 2*5*10', '30043919', 0.05, 320, 'Tablet', 'Oral',
  '2*5*10', 'STRIP', NULL, NULL, NULL,
  'Consult physician', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('GLADFY-MP2 TAB 10*10', 'Consult physician', 1056, ARRAY['General / Other Care'], 0,
  'GLADFY-MP2 TAB 10*10', '84425010       84425010', 0.05, 1200, 'Tablet', 'Oral',
  '10*10', 'STRIP', NULL, NULL, '~130–170 g',
  'Consult physician', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('GLISCORT-100 INJ 100 MG/VIAL', 'Used for various medical conditions; consult a physician for specific use.', 42.0992, ARRAY['General / Other Care'], 0,
  'GLISCORT-100 INJ 100 MG/VIAL', '30043200', 0.05, 47.84, 'Injection', 'Oral',
  '100 MG/VIAL', 'VIAL', 'Hydrocortisone 100 mg', 'Hydrocortisone 100 mg', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('GRAMSPAN-40 TAB 10*10 10*10', 'Acidity, heartburn, stomach ulcers, and GERD', 1056, ARRAY['Digestive Care'], 0,
  'GRAMSPAN-40 TAB 10*10 10*10', '300420', 0.05, 1200, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Pantoprazole 40 mg', 'Pantoprazole 40 mg', '~130–170 g',
  'Acidity, heartburn, stomach ulcers, and GERD', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('GRAMSPAN-40 TAB 10*15', 'Acidity, heartburn, stomach ulcers, and GERD', 907.5, ARRAY['Digestive Care'], 0,
  'GRAMSPAN-40 TAB 10*15', '30049039', 0.05, 1031.25, 'Tablet', 'Oral',
  '10*15', 'STRIP', 'Pantoprazole 40 mg', 'Pantoprazole 40 mg', NULL,
  'Acidity, heartburn, stomach ulcers, and GERD', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('GRAMSPAN-D TAB 10*15', 'Acidity, heartburn, stomach ulcers, and GERD', 990, ARRAY['Digestive Care'], 0,
  'GRAMSPAN-D TAB 10*15', '30049039', 0.05, 1125, 'Tablet', 'Oral',
  '10*15', 'STRIP', 'Pantoprazole 40 mg + Domperidone 10 mg', 'Pantoprazole 40 mg + Domperidone 10 mg', NULL,
  'Acidity, heartburn, stomach ulcers, and GERD', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('GRAMSPAN-DSR ALU-ALU 10*10', 'Acidity, heartburn, stomach ulcers, and GERD', 983.84, ARRAY['Digestive Care'], 0,
  'GRAMSPAN-DSR ALU-ALU 10*10', '300490', 0.05, 1118, 'Capsule', 'Oral',
  '10*10', 'STRIP', 'Pantoprazole 40 mg (EC) + Domperidone 30mg(SR)', 'Pantoprazole 40 mg (EC) + Domperidone 30mg(SR)', '~130–170 g',
  'Acidity, heartburn, stomach ulcers, and GERD', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('GRAMSPAN-DSR CAP 10*15', 'Acidity, heartburn, stomach ulcers, and GERD', 1469.6, ARRAY['Digestive Care'], 0,
  'GRAMSPAN-DSR CAP 10*15', '30049039', 0.05, 1670, 'Capsule', 'Oral',
  '10*15', 'STRIP', 'Pantoprazole 40 mg (EC) + Domperidone 20 mg (SR) + Domperidone 10 mg (IR)', 'Pantoprazole 40 mg (EC) + Domperidone 20 mg (SR) + Domperidone 10 mg (IR)', NULL,
  'Acidity, heartburn, stomach ulcers, and GERD', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('GRAMSPAN-IV INJ 40 MG', 'Acidity, heartburn, stomach ulcers, and GERD', 47.4232, ARRAY['Digestive Care'], 0,
  'GRAMSPAN-IV INJ 40 MG', '30049039', 0.05, 53.89, 'Injection', 'IV',
  '40 MG', 'VIAL', 'Pantoprazole 40 mg', 'Pantoprazole 40 mg', NULL,
  'Acidity, heartburn, stomach ulcers, and GERD', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('GRAMSPAN-L CAP 10*10', 'Acidity, heartburn, stomach ulcers, and GERD', 2376, ARRAY['Digestive Care'], 0,
  'GRAMSPAN-L CAP 10*10', '300420', 0.05, 2700, 'Capsule', 'Oral',
  '10*10', 'STRIP', 'Pantoprazole 40 mg (EC) + Levosulpiride 75 mg (SR)', 'Pantoprazole 40 mg (EC) + Levosulpiride 75 mg (SR)', '~130–170 g',
  'Acidity, heartburn, stomach ulcers, and GERD', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('GRAMSPAN-O TAB 10*15', 'Acidity, heartburn, stomach ulcers, and GERD', 1196.2544, ARRAY['Digestive Care'], 0,
  'GRAMSPAN-O TAB 10*15', '30049039', 0.05, 1359.38, 'Tablet', 'Oral',
  '10*15', 'STRIP', 'Pantoprazole 40 mg + Ondansetron 4 mg', 'Pantoprazole 40 mg + Ondansetron 4 mg', NULL,
  'Acidity, heartburn, stomach ulcers, and GERD', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('GUMSNORM MOUTH WASH 100 ML', 'Used for various medical conditions; consult a physician for specific use.', 86.6272, ARRAY['General / Other Care'], 0,
  'GUMSNORM MOUTH WASH 100 ML', '30049099', 0.05, 98.44, 'Mouth Wash', 'Oral',
  '100 ML', 'BOTTLE', 'Chlorhexidine Gluconate Solution Mouth Wash (Mint Flavour)', 'Chlorhexidine Gluconate Solution Mouth Wash (Mint Flavour)', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('GUMSNORM TOOTH GEL 50 GM', 'Used for various medical conditions; consult a physician for specific use.', 105.6, ARRAY['Skin Care'], 0,
  'GUMSNORM TOOTH GEL 50 GM', '30049099', 0.05, 120, 'Tooth Gel', 'topical',
  '50 GM', 'TUBE', 'Potassium Nitrate 5% w/w + Sodium Monofluorophosphate 0.70% w/w + Triclosan 0.30% w/w Tooth Gel', 'Potassium Nitrate 5% w/w + Sodium Monofluorophosphate 0.70% w/w + Triclosan 0.30% w/w Tooth Gel', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('GUMSNORM-M GEL 15 GM', 'Used for various medical conditions; consult a physician for specific use.', 74.25439999999999, ARRAY['Skin Care'], 0,
  'GUMSNORM-M GEL 15 GM', '30049099', 0.05, 84.38, 'Gel', 'topical',
  '15 GM', 'TUBE', 'Metronidazole 1.0% + Chlorhexidine 0.5%', 'Metronidazole 1.0% + Chlorhexidine 0.5%', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('HELISTORM-ACE KIT TAB 10*1*6', 'Acidity, heartburn, stomach ulcers, and GERD', 2079, ARRAY['Digestive Care'], 0,
  'HELISTORM-ACE KIT TAB 10*1*6', '30042063', 0.05, 2362.5, 'Tablet', 'Oral',
  '10*1*6', 'STRIP', 'Combipack of Clarithromycin Tablets 500 mg, Esomeprazole Gastro-Resistant Tablets 40 mg, & Amoxicillin Tablets 750 mg', 'Combipack of Clarithromycin Tablets 500 mg, Esomeprazole Gastro-Resistant Tablets 40 mg, & Amoxicillin Tablets 750 mg', NULL,
  'Acidity, heartburn, stomach ulcers, and GERD', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('HEPSLOT-400 TAB 10*1*10', 'Used for various medical conditions; consult a physician for specific use.', 10340, ARRAY['General / Other Care'], 0,
  'HEPSLOT-400 TAB 10*1*10', '30049099', 0.05, 11750, 'Tablet', 'Oral',
  '10*1*10', 'STRIP', 'S-Adenosyl-L-Methionine Disulfate Tosylate 400 mg', 'S-Adenosyl-L-Methionine Disulfate Tosylate 400 mg', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('HOLDBACK-200 SR TAB 10*1*10', 'Used for various medical conditions; consult a physician for specific use.', 3250.5, ARRAY['General / Other Care'], 0,
  'HOLDBACK-200 SR TAB 10*1*10', '30043919', 0.05, 3693.75, 'Tablet', 'Oral',
  '10*1*10', 'STRIP', 'Natural Micronized Progesterone 200 mg (Sustained Release)', 'Natural Micronized Progesterone 200 mg (Sustained Release)', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('HOLDBACK-300 SR TAB 10*1*10', 'Used for various medical conditions; consult a physician for specific use.', 4537.5, ARRAY['General / Other Care'], 0,
  'HOLDBACK-300 SR TAB 10*1*10', '30043919', 0.05, 5156.25, 'Tablet', 'Oral',
  '10*1*10', 'STRIP', 'Natural Micronized Progesterone 300 mg (Sustained Release)', 'Natural Micronized Progesterone 300 mg (Sustained Release)', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('HOLDBACK-M TAB 2*5*10', 'Used for various medical conditions; consult a physician for specific use.', 576.6727999999999, ARRAY['General / Other Care'], 0,
  'HOLDBACK-M TAB 2*5*10', '30043919', 0.05, 655.31, 'Tablet', 'Oral',
  '2*5*10', 'STRIP', 'Medroxyprogesterone Acetate 10 mg', 'Medroxyprogesterone Acetate 10 mg', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('HYDROBILE SUSP 100 ML', 'Liver health and Liver disorders', 343.2, ARRAY['General / Other Care'], 0,
  'HYDROBILE SUSP 100 ML', '30049036', 0.05, 390, 'Suspension', 'Oral',
  '100 ML', 'BOTTLE', 'Ursodeoxycholic Acid 125 mg', 'Ursodeoxycholic Acid 125 mg', NULL,
  'Liver health and Liver disorders', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('HYDROBILE-150 TAB 10*10', 'Liver health and Liver disorders', 1848, ARRAY['General / Other Care'], 0,
  'HYDROBILE-150 TAB 10*10', '30049036', 0.05, 2100, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Ursodeoxycholic Acid 150 mg', 'Ursodeoxycholic Acid 150 mg', '~130–170 g',
  'Liver health and Liver disorders', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('HYDROBILE-300 TAB 10*10', 'Liver health and Liver disorders', 3432, ARRAY['General / Other Care'], 0,
  'HYDROBILE-300 TAB 10*10', '30049036', 0.05, 3900, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Ursodeoxycholic Acid 300 mg', 'Ursodeoxycholic Acid 300 mg', '~130–170 g',
  'Liver health and Liver disorders', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('INDOPRES-SR CAP 10*10', 'Used for various medical conditions; consult a physician for specific use.', 1237.5, ARRAY['General / Other Care'], 0,
  'INDOPRES-SR CAP 10*10', '30049066', 0.05, 1406.25, 'Capsule', 'Oral',
  '10*10', 'STRIP', 'Indomethacin 75 mg (SR)', 'Indomethacin 75 mg (SR)', '~130–170 g',
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('INSTAVIBE (ORANGE) 105 GM', 'Nutritional supplement for bone health, nerve health, or immunity', 66.572, ARRAY['Nutritional Supplement'], 0,
  'INSTAVIBE (ORANGE) 105 GM', '21069099', 0.05, 75.65, 'Drink Powder', 'Oral',
  '105 GM', 'JAR', 'Dextrose, Minerals, Vitamin C, D3, B1, B2, B6, Creatine, Cyanocobalamin, Zinc Sulphate', 'Dextrose, Minerals, Vitamin C, D3, B1, B2, B6, Creatine, Cyanocobalamin, Zinc Sulphate', NULL,
  'Nutritional supplement for bone health, nerve health, or immunity', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('INSTAVIBE SACHET 25G*10', 'Nutritional supplement for bone health, nerve health, or immunity', 211.464, ARRAY['Nutritional Supplement'], 0,
  'INSTAVIBE SACHET 25G*10', '21069099', 0.05, 240.3, 'Sachet', 'Oral',
  '25G*10', 'PACKET', 'Dextrose, Minerals, Vitamin C, D3, B1, B2, B6, Creatine, Cyanocobalamin, Zinc Sulphate', 'Dextrose, Minerals, Vitamin C, D3, B1, B2, B6, Creatine, Cyanocobalamin, Zinc Sulphate', NULL,
  'Nutritional supplement for bone health, nerve health, or immunity', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('INSTAVIBE-ZORS SACHET 21G*10', 'Nutritional supplement for bone health, nerve health, or immunity', 211.464, ARRAY['Nutritional Supplement'], 0,
  'INSTAVIBE-ZORS SACHET 21G*10', '21069099', 0.05, 240.3, 'Sachet', 'Oral',
  '21G*10', 'PACKET', 'Super Rehydration Salts with Zinc & Lactobacillus Powder', 'Super Rehydration Salts with Zinc & Lactobacillus Powder', NULL,
  'Nutritional supplement for bone health, nerve health, or immunity', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('IPSMOL RESPULES 5*5*2.5ML', 'Cough, Asthma, COPD, and Bronchitis', 407.34319999999997, ARRAY['Respiratory Care'], 0,
  'IPSMOL RESPULES 5*5*2.5ML', '30049099', 0.05, 462.89, 'Respules', 'Oral',
  '5*5*2.5ML', 'BOTTLE', 'Levosalbutamol 1.25 mg + Ipratropium Bromide 500 mcg / 2.5 ml Respiratory Solution', 'Levosalbutamol 1.25 mg + Ipratropium Bromide 500 mcg / 2.5 ml Respiratory Solution', NULL,
  'Cough, Asthma, COPD, and Bronchitis', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('IQC INJ 1*2ML', 'Used for various medical conditions; consult a physician for specific use.', 152.6184, ARRAY['General / Other Care'], 0,
  'IQC INJ 1*2ML', '30049069', 0.05, 173.43, 'Injection', 'IV',
  '1*2ML', 'VIAL', 'Citicoline Sodium 250 mg', 'Citicoline Sodium 250 mg', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('ITSFINE SOAP 75 GM', 'Fungal infections', 105.732, ARRAY['Skin Care'], 0,
  'ITSFINE SOAP 75 GM', '34011110', 0.05, 120.15, 'Soap', 'topical',
  '75 GM', 'BOX', 'Itraconazole 1% w/w', 'Itraconazole 1% w/w', NULL,
  'Fungal infections', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('ITSFINE-100 CAP 10*10', 'Fungal infections', 1567.0864, ARRAY['Skin Care'], 0,
  'ITSFINE-100 CAP 10*10', '30049099', 0.05, 1780.78, 'Capsule', 'Oral',
  '10*10', 'STRIP', 'Itraconazole 100 mg', 'Itraconazole 100 mg', '~130–170 g',
  'Fungal infections', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('ITSFINE-200 CAP 10*10', 'Fungal infections', 1815, ARRAY['Skin Care'], 0,
  'ITSFINE-200 CAP 10*10', '30049099', 0.05, 2062.5, 'Capsule', 'Oral',
  '10*10', 'STRIP', 'Itraconazole 200 mg', 'Itraconazole 200 mg', '~130–170 g',
  'Fungal infections', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('JACKSPOR-100 DRY SYP 30 ML', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 67.35520000000001, ARRAY['Infection Care'], 0,
  'JACKSPOR-100 DRY SYP 30 ML', '30042019', 0.05, 76.54, 'Dry syrup', 'Oral',
  '30 ML', 'GLASS BOTTLE', 'Cefixime 100 mg/5ml (Sterile Water)', 'Cefixime 100 mg/5ml (Sterile Water)', NULL,
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('JACKSPOR-100 DT TAB 10*10', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 899.2544, ARRAY['Infection Care'], 0,
  'JACKSPOR-100 DT TAB 10*10', '30042019', 0.05, 1021.88, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Cefixime 100 mg (Dispersible)', 'Cefixime 100 mg (Dispersible)', '~130–170 g',
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('JACKSPOR-200 DT TAB 10*10', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 919.336, ARRAY['Infection Care'], 0,
  'JACKSPOR-200 DT TAB 10*10', '30042019', 0.05, 1044.7, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Cefixime 200 mg (Dispersible)', 'Cefixime 200 mg (Dispersible)', '~130–170 g',
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('JACKSPOR-50 DRY SYP 15GM/30ML', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 46.0064, ARRAY['Infection Care'], 0,
  'JACKSPOR-50 DRY SYP 15GM/30ML', '30042039', 0.05, 52.28, 'Dry syrup', 'Oral',
  '15GM/30ML', 'MINI BOTTLE', 'Cefixime 50 mg/5ml (Sterile Water)', 'Cefixime 50 mg/5ml (Sterile Water)', NULL,
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('JACKSPOR-CV 325 TAB 10*1*10', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 3093.7544000000003, ARRAY['Infection Care'], 0,
  'JACKSPOR-CV 325 TAB 10*1*10', '30042019', 0.05, 3515.63, 'Tablet', 'Oral',
  '10*1*10', 'STRIP', 'Cefixime 200 mg + Potassium Clavulanate 125 mg', 'Cefixime 200 mg + Potassium Clavulanate 125 mg', NULL,
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('JACKSPOR-LB 200 TAB 10*10', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 1196.2544, ARRAY['Infection Care'], 0,
  'JACKSPOR-LB 200 TAB 10*10', '30042019', 0.05, 1359.38, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Cefixime 200 mg + Potassium Clavulanate', 'Cefixime 200 mg + Potassium Clavulanate', '~130–170 g',
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('JACKSPOR-O 200 TAB 10*10', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 1601.6, ARRAY['Infection Care'], 0,
  'JACKSPOR-O 200 TAB 10*10', '30042034', 0.05, 1820, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Cefixime 200 mg + Ofloxacin 200 mg', 'Cefixime 200 mg + Ofloxacin 200 mg', '~130–170 g',
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('JACKSPOR-O DRY SYP 15GM/30ML', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 70.1272, ARRAY['Infection Care'], 0,
  'JACKSPOR-O DRY SYP 15GM/30ML', '30042034', 0.05, 79.69, 'Dry syrup', 'Oral',
  '15GM/30ML', 'GLASS BOTTLE', 'Cefixime 50 mg + Ofloxacin 50 mg (Sterile Water)', 'Cefixime 50 mg + Ofloxacin 50 mg (Sterile Water)', NULL,
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('JACKZYME DROPS 15 ML', 'Used for various medical conditions; consult a physician for specific use.', 50.908, ARRAY['General / Other Care'], 0,
  'JACKZYME DROPS 15 ML', '21069099', 0.05, 57.85, 'Drops', 'Oral',
  '15 ML', 'MINI BOTTLE', 'Fungal Diastase with Pepsin Drops', 'Fungal Diastase with Pepsin Drops', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('JACKZYME SYP 200 ML', 'Used for various medical conditions; consult a physician for specific use.', 105.6, ARRAY['General / Other Care'], 0,
  'JACKZYME SYP 200 ML', '21069099', 0.05, 120, 'Syrup', 'Oral',
  '200 ML', 'BOTTLE', 'Pepsin, Fungal Diastase with Sorbitol Syrup', 'Pepsin, Fungal Diastase with Sorbitol Syrup', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('JACKZYME TAB 5*2*15', 'Used for various medical conditions; consult a physician for specific use.', 1047.2, ARRAY['Pain / Muscle Care'], 0,
  'JACKZYME TAB 5*2*15', '21069099', 0.05, 1190, 'Tablet', 'Oral',
  '5*2*15', 'STRIP', 'Fungal Diastase 100 mg, Papain 60 mg and Activated Charcoal 75 mg', 'Fungal Diastase 100 mg, Papain 60 mg and Activated Charcoal 75 mg', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('JOYSCOOP-PLUS SG CAP 10*1*10', 'Nutritional supplement for bone health, nerve health, or immunity', 979, ARRAY['Skin Care'], 0,
  'JOYSCOOP-PLUS SG CAP 10*1*10', '29362390', 0.05, 1112.5, 'Softgel Capsule', 'Oral',
  '10*1*10', 'STRIP', 'Complete Antioxidant with Ginseng, Multivitamin, Multimineral & Lactic Acid Bacillus Softgel Capsules', 'Complete Antioxidant with Ginseng, Multivitamin, Multimineral & Lactic Acid Bacillus Softgel Capsules', NULL,
  'Nutritional supplement for bone health, nerve health, or immunity', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('JOYZINC DROPS 30 ML', 'Nutritional supplement for bone health, nerve health, or immunity', 103.95439999999999, ARRAY['Nutritional Supplement'], 0,
  'JOYZINC DROPS 30 ML', '30049099', 0.05, 118.13, 'Drops', 'Oral',
  '30 ML', 'MINI BOTTLE', 'Zinc Gluconate 20 mg', 'Zinc Gluconate 20 mg', NULL,
  'Nutritional supplement for bone health, nerve health, or immunity', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('JOYZINC SYP 100 ML', 'Nutritional supplement for bone health, nerve health, or immunity', 105.6, ARRAY['Nutritional Supplement'], 0,
  'JOYZINC SYP 100 ML', '30049099', 0.05, 120, 'Syrup', 'Oral',
  '100 ML', 'BOTTLE', 'Zinc Gluconate 20 mg/5ml', 'Zinc Gluconate 20 mg/5ml', NULL,
  'Nutritional supplement for bone health, nerve health, or immunity', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('JUSTLOCK CREAM 30 GM', 'Used for various medical conditions; consult a physician for specific use.', 272.8, ARRAY['Skin Care'], 0,
  'JUSTLOCK CREAM 30 GM', '30049099', 0.05, 310, 'Cream', 'topical',
  '30 GM', 'TUBE', 'Luliconazole Cream 1.0% w/w', 'Luliconazole Cream 1.0% w/w', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('JUSTLOCK SOAP 75 GM', 'Used for various medical conditions; consult a physician for specific use.', 113.56400000000001, ARRAY['Skin Care'], 0,
  'JUSTLOCK SOAP 75 GM', '34011110', 0.05, 129.05, 'Soap', 'topical',
  '75 GM', 'BOX', 'Luliconazole 1% w/w', 'Luliconazole 1% w/w', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('KETMOLIN-DT TAB 10*15', 'Used for various medical conditions; consult a physician for specific use.', 1072.5, ARRAY['General / Other Care'], 0,
  'KETMOLIN-DT TAB 10*15', '30049099', 0.05, 1218.75, 'Tablet', 'Oral',
  '10*15', 'STRIP', 'Ketorolac Tromethamine 10 mg (Dispersible)', 'Ketorolac Tromethamine 10 mg (Dispersible)', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('LANSBERG-JUNIOR TAB 10*15', 'Used for various medical conditions; consult a physician for specific use.', 1031.2544, ARRAY['Digestive Care'], 0,
  'LANSBERG-JUNIOR TAB 10*15', '30049099', 0.05, 1171.88, 'Tablet', 'Oral',
  '10*15', 'STRIP', 'Lansoprazole 15 mg Orally Disintegrating Tablets', 'Lansoprazole 15 mg Orally Disintegrating Tablets', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('LANSBERG-RD CAP 10*10', 'Used for various medical conditions; consult a physician for specific use.', 1452, ARRAY['Digestive Care'], 0,
  'LANSBERG-RD CAP 10*10', '30049039', 0.05, 1650, 'Capsule', 'Oral',
  '10*10', 'STRIP', 'Lansoprazole (EC) 30 mg + Domperidone (SR) 30 mg', 'Lansoprazole (EC) 30 mg + Domperidone (SR) 30 mg', '~130–170 g',
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('LAXPOSE FIBER 150 GM', 'Used for various medical conditions; consult a physician for specific use.', 309.3728, ARRAY['General / Other Care'], 0,
  'LAXPOSE FIBER 150 GM', '30039011', 0.05, 351.56, 'Granules', 'Oral',
  '150 GM', 'JAR', 'Lactitol Monohydrate 10 gm & Ispaghula Husk 3.5 gm (Husk Granules) (Sugar Free)', 'Lactitol Monohydrate 10 gm & Ispaghula Husk 3.5 gm (Husk Granules) (Sugar Free)', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('LAXPOSE SYP 100 ML', 'Used for various medical conditions; consult a physician for specific use.', 110, ARRAY['Digestive Care'], 0,
  'LAXPOSE SYP 100 ML', '30049045', 0.05, 125, 'Syrup', 'Oral',
  '100 ML', 'BOTTLE', 'Lactulose Solution 10 gm/15ml', 'Lactulose Solution 10 gm/15ml', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('LAXPOSE SYP 200 ML', 'Used for various medical conditions; consult a physician for specific use.', 225.28, ARRAY['Digestive Care'], 0,
  'LAXPOSE SYP 200 ML', '30049045', 0.05, 256, 'Syrup', 'Oral',
  '200 ML', 'BOTTLE', 'Lactulose Solution 10 gm/15ml', 'Lactulose Solution 10 gm/15ml', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('LAXPOSE-3 SUSP 200 ML', 'Used for various medical conditions; consult a physician for specific use.', 163.68, ARRAY['General / Other Care'], 0,
  'LAXPOSE-3 SUSP 200 ML', '30049032', 0.05, 186, 'Suspension', 'Oral',
  '200 ML', 'BOTTLE', 'Liquid Paraffin 1.25 ml + Milk of Magnesia 3.75 ml + Sodium Picosulfate 3.33 mg', 'Liquid Paraffin 1.25 ml + Milk of Magnesia 3.75 ml + Sodium Picosulfate 3.33 mg', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('LEGSPIN-16 TAB 10*15', 'Used for various medical conditions; consult a physician for specific use.', 1485, ARRAY['General / Other Care'], 0,
  'LEGSPIN-16 TAB 10*15', '30049039', 0.05, 1687.5, 'Tablet', 'Oral',
  '10*15', 'STRIP', 'Betahistine Hydrochloride 16 mg', 'Betahistine Hydrochloride 16 mg', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('LEGSPIN-24 TAB 10*15', 'Used for various medical conditions; consult a physician for specific use.', 1856.2544, ARRAY['General / Other Care'], 0,
  'LEGSPIN-24 TAB 10*15', '30049039', 0.05, 2109.38, 'Tablet', 'Oral',
  '10*15', 'STRIP', 'Betahistine Dihydrochloride 24 mg', 'Betahistine Dihydrochloride 24 mg', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('LEGSPIN-8 TAB 10*15', 'Used for various medical conditions; consult a physician for specific use.', 990, ARRAY['General / Other Care'], 0,
  'LEGSPIN-8 TAB 10*15', '30049039', 0.05, 1125, 'Tablet', 'Oral',
  '10*15', 'STRIP', 'Betahistine Hydrochloride 8 mg', 'Betahistine Hydrochloride 8 mg', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('LETS UP 5 TAB 10*1*5', 'Used for various medical conditions; consult a physician for specific use.', 2552, ARRAY['General / Other Care'], 0,
  'LETS UP 5 TAB 10*1*5', '30049099', 0.05, 2900, 'Tablet', 'Oral',
  '10*1*5', 'STRIP', 'Letrozole 5 mg', 'Letrozole 5 mg', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('LG-BEC EAR DROPS 5 ML', 'Used for various medical conditions; consult a physician for specific use.', 59.84, ARRAY['Skin Care'], 0,
  'LG-BEC EAR DROPS 5 ML', '30049099', 0.05, 68, 'Ear drops', 'Oral',
  '5 ML', 'MINI BOTTLE', 'Gentamicin Sulphate 0.3% w/v + Beclomethasone Dipropionate 0.025% w/v + Clotrimazole 1.0% w/v + Lignocaine Hydrochloride 2.0% w/v', 'Gentamicin Sulphate 0.3% w/v + Beclomethasone Dipropionate 0.025% w/v + Clotrimazole 1.0% w/v + Lignocaine Hydrochloride 2.0% w/v', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('LGZ TAB 10*1*10', 'Nutritional supplement for bone health, nerve health, or immunity', 2349.6, ARRAY['Nutritional Supplement'], 0,
  'LGZ TAB 10*1*10', '21069099', 0.05, 2670, 'Tablet', 'Oral',
  '10*1*10', 'STRIP', 'L-Glutamic Acid 300 mg + Zinc Sulphate 17 mg', 'L-Glutamic Acid 300 mg + Zinc Sulphate 17 mg', NULL,
  'Nutritional supplement for bone health, nerve health, or immunity', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('LIBIFERT CAP 10*1*10', 'Used for various medical conditions; consult a physician for specific use.', 2059.2, ARRAY['General / Other Care'], 0,
  'LIBIFERT CAP 10*1*10', '30039011', 0.05, 2340, 'Capsule', 'Oral',
  '10*1*10', 'STRIP', 'Herbal Solutions for Male Infertility ( Ashwagandha, Shatavari, Kapikacchu, Safed Musli & Purified Shilajit Capsules )', 'Herbal Solutions for Male Infertility ( Ashwagandha, Shatavari, Kapikacchu, Safed Musli & Purified Shilajit Capsules )', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('LINEMINT SG CAP 10*10', 'Used for various medical conditions; consult a physician for specific use.', 1672, ARRAY['Skin Care'], 0,
  'LINEMINT SG CAP 10*10', '29362390', 0.05, 1900, 'Softgel Capsule', 'Oral',
  '10*10', 'STRIP', 'Mentha Piperita (Peppermint Oil) 300 mg Softgel Capsules', 'Mentha Piperita (Peppermint Oil) 300 mg Softgel Capsules', '~130–170 g',
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('LINZMOL-600 TAB 10*1*6', 'Used for various medical conditions; consult a physician for specific use.', 1782, ARRAY['Infection Care'], 0,
  'LINZMOL-600 TAB 10*1*6', '30049099', 0.05, 2025, 'Tablet', 'Oral',
  '10*1*6', 'STRIP', 'Linezolid 600 mg', 'Linezolid 600 mg', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('LV-DOT-500 TAB 10*10', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 845.3808, ARRAY['Infection Care'], 0,
  'LV-DOT-500 TAB 10*10', '30049082', 0.05, 960.66, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Levofloxacin 500 mg', 'Levofloxacin 500 mg', '~130–170 g',
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('M-STEEL FORTE TAB 10*1*10', 'Nutritional supplement for bone health, nerve health, or immunity', 3054.48, ARRAY['Nutritional Supplement'], 0,
  'M-STEEL FORTE TAB 10*1*10', '21069099', 0.05, 3471, 'Tablet', 'Oral',
  '10*1*10', 'STRIP', 'Collagen Peptide Type 1, Glucosamine Sulphate Potassium Chloride, Chondroitin Sulphate Sodium, Sodium Hyaluronate, Multivitamin, Folic Acid & Zinc', 'Collagen Peptide Type 1, Glucosamine Sulphate Potassium Chloride, Chondroitin Sulphate Sodium, Sodium Hyaluronate, Multivitamin, Folic Acid & Zinc', NULL,
  'Nutritional supplement for bone health, nerve health, or immunity', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('MALAZONE-L TAB 10*1*6', 'Used for various medical conditions; consult a physician for specific use.', 1410.7544, ARRAY['General / Other Care'], 0,
  'MALAZONE-L TAB 10*1*6', '30049099', 0.05, 1603.13, 'Tablet', 'Oral',
  '10*1*6', 'STRIP', 'Artemether 80 mg + Lumefantrine 480 mg', 'Artemether 80 mg + Lumefantrine 480 mg', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('MIGHTY RED SYP 300 ML', 'Kidney stones, Gout, and Urinary Tract Infections (UTI)', 177.8832, ARRAY['Nutritional Supplement'], 0,
  'MIGHTY RED SYP 300 ML', '30045010', 0.05, 202.14, 'Syrup', 'Oral',
  '300 ML', 'BOTTLE', 'Ferric Ammonium Citrate 160 mg (eq. to Elemental Iron 32.8 mg) + Cyanocobalamin 7.5 mcg + Folic Acid 0.5 mg + Cupric Sulphate 30 mcg + Manganese Sulphate 30 mcg', 'Ferric Ammonium Citrate 160 mg (eq. to Elemental Iron 32.8 mg) + Cyanocobalamin 7.5 mcg + Folic Acid 0.5 mg + Cupric Sulphate 30 mcg + Manganese Sulphate 30 mcg', NULL,
  'Kidney stones, Gout, and Urinary Tract Infections (UTI)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('MIGHTY RED-FCM INJ 10 ML', 'Used for various medical conditions; consult a physician for specific use.', 2681.2544000000003, ARRAY['General / Other Care'], 0,
  'MIGHTY RED-FCM INJ 10 ML', '30045090', 0.05, 3046.88, 'Injection', 'IV',
  '10 ML', 'VIAL', 'Ferric Carboxymaltose (500mg/10ml)', 'Ferric Carboxymaltose (500mg/10ml)', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('MIGHTY RED-M TAB 10*15', 'Nutritional supplement for bone health, nerve health, or immunity', 1731.84, ARRAY['Nutritional Supplement'], 0,
  'MIGHTY RED-M TAB 10*15', '30049099', 0.05, 1968, 'Tablet', 'Oral',
  '10*15', 'STRIP', 'Ferrous Bis-Glycinate 60 mg + Folic Acid 1 mg + Zinc Bis-Glycinate 15 mg + Methlycobalamin 500 mcg', 'Ferrous Bis-Glycinate 60 mg + Folic Acid 1 mg + Zinc Bis-Glycinate 15 mg + Methlycobalamin 500 mcg', NULL,
  'Nutritional supplement for bone health, nerve health, or immunity', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('MIGHTY RED-M XT SUSP 200 ML', 'Nutritional supplement for bone health, nerve health, or immunity', 156.7544, ARRAY['Nutritional Supplement'], 0,
  'MIGHTY RED-M XT SUSP 200 ML', '30049099', 0.05, 178.13, 'Suspension', 'Oral',
  '200 ML', 'BOTTLE', 'Ferrous Ascorbate 30 mg + Folic Acid 0.5 mg + Methylcobalamin 500 mcg', 'Ferrous Ascorbate 30 mg + Folic Acid 0.5 mg + Methylcobalamin 500 mcg', NULL,
  'Nutritional supplement for bone health, nerve health, or immunity', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('MIGHTY RED-XT DROPS 15 ML', 'Nutritional supplement for bone health, nerve health, or immunity', 78.3728, ARRAY['Nutritional Supplement'], 0,
  'MIGHTY RED-XT DROPS 15 ML', '30049099', 0.05, 89.06, 'Drops', 'Oral',
  '15 ML', 'MINI BOTTLE', 'Ferrous Ascorbate 10 mg + Folic Acid 100 mcg', 'Ferrous Ascorbate 10 mg + Folic Acid 100 mcg', NULL,
  'Nutritional supplement for bone health, nerve health, or immunity', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('MIGHTY RED-XT SUSP 200 ML', 'Nutritional supplement for bone health, nerve health, or immunity', 132, ARRAY['Nutritional Supplement'], 0,
  'MIGHTY RED-XT SUSP 200 ML', '30049099', 0.05, 150, 'Suspension', 'Oral',
  '200 ML', 'BOTTLE', 'Ferrous Ascorbate 30 mg + Folic Acid 550 mcg', 'Ferrous Ascorbate 30 mg + Folic Acid 550 mcg', NULL,
  'Nutritional supplement for bone health, nerve health, or immunity', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('MIGHTY RED-XT TAB 10*10', 'Nutritional supplement for bone health, nerve health, or immunity', 1072.5, ARRAY['Nutritional Supplement'], 0,
  'MIGHTY RED-XT TAB 10*10', '300410', 0.05, 1218.75, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Ferrous Ascorbate 100 mg + Folic Acid 1.5 mg + Zinc Sulphate 22.5 mg', 'Ferrous Ascorbate 100 mg + Folic Acid 1.5 mg + Zinc Sulphate 22.5 mg', '~130–170 g',
  'Nutritional supplement for bone health, nerve health, or immunity', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('MIGHTY-RED INJ 1*5 ML', 'Nutritional supplement for bone health, nerve health, or immunity', 231, ARRAY['Nutritional Supplement'], 0,
  'MIGHTY-RED INJ 1*5 ML', '30049099', 0.05, 262.5, 'Injection', 'IV',
  '1*5 ML', 'VIAL', 'Iron Sucrose 100 mg', 'Iron Sucrose 100 mg', NULL,
  'Nutritional supplement for bone health, nerve health, or immunity', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('MILKY GLOW SG CAP 30 CAP', 'Used for various medical conditions; consult a physician for specific use.', 1751.2, ARRAY['Nutritional Supplement'], 0,
  'MILKY GLOW SG CAP 30 CAP', '30042099', 0.05, 1990, 'Softgel Capsule', 'Oral',
  '30 CAP', 'JAR', 'Opitac L-Glutathione Reduced 200 mg + Vitamin C 40 mg + Alpha Lipoic Acid 100 mg + Vitamin E 14.9 mg + Grape Seed Extract 100 mg + Green Tea Extract 50 mg', 'Opitac L-Glutathione Reduced 200 mg + Vitamin C 40 mg + Alpha Lipoic Acid 100 mg + Vitamin E 14.9 mg + Grape Seed Extract 100 mg + Green Tea Extract 50 mg', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('MINDSPOT-CT TAB 10*1*10', 'Used for various medical conditions; consult a physician for specific use.', 5692.5, ARRAY['General / Other Care'], 0,
  'MINDSPOT-CT TAB 10*1*10', '30049099', 0.05, 6468.75, 'Tablet', 'Oral',
  '10*1*10', 'STRIP', 'Citicoline 500 mg & Piracetam 800 mg', 'Citicoline 500 mg & Piracetam 800 mg', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('MISBELLA-E SG CAP 10*1*10', 'Used for various medical conditions; consult a physician for specific use.', 1213.96, ARRAY['Skin Care'], 0,
  'MISBELLA-E SG CAP 10*1*10', '29362390', 0.05, 1379.5, 'Softgel Capsule', 'Oral',
  '10*1*10', 'STRIP', 'Omega-3 Fatty Acids 500 mg & Vitamin E 400 IU Softgel Capsules', 'Omega-3 Fatty Acids 500 mg & Vitamin E 400 IU Softgel Capsules', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('MISBELLA-E SOAP 75 GM', 'Used for various medical conditions; consult a physician for specific use.', 58.74, ARRAY['Skin Care'], 0,
  'MISBELLA-E SOAP 75 GM', '34011110', 0.05, 66.75, 'Soap', 'topical',
  '75 GM', 'BOX', 'Allantoin 0.25% w/w, Vitamin E Acetate 0.25% w/w, Tea Tree Oil 0.5% w/w', 'Allantoin 0.25% w/w, Vitamin E Acetate 0.25% w/w, Tea Tree Oil 0.5% w/w', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('MOULIN''S Q10-300 TAB 10*1*10', 'Nutritional supplement for bone health, nerve health, or immunity', 5984, ARRAY['Nutritional Supplement'], 0,
  'MOULIN''S Q10-300 TAB 10*1*10', '21069099', 0.05, 6800, 'Tablet', 'Oral',
  '10*1*10', 'STRIP', 'Co-enzyme Q10 300 mg + Omega 3 Fatty Acids 150 mg + L-Arginine 100 mg + L-Carnitine 50 mg + Piperine 5 mg + Lycopene 5000 mcg', 'Co-enzyme Q10 300 mg + Omega 3 Fatty Acids 150 mg + L-Arginine 100 mg + L-Carnitine 50 mg + Piperine 5 mg + Lycopene 5000 mcg', NULL,
  'Nutritional supplement for bone health, nerve health, or immunity', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('MOXMOL-250 TAB 10*10', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 536.2544, ARRAY['Infection Care'], 0,
  'MOXMOL-250 TAB 10*10', '30041030', 0.05, 609.38, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Amoxycillin 250 mg (Dispersible)', 'Amoxycillin 250 mg (Dispersible)', '~130–170 g',
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('MOXMOL-500 CAP 10*10', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 678.9728, ARRAY['Infection Care'], 0,
  'MOXMOL-500 CAP 10*10', '30041030', 0.05, 771.56, 'Capsule', 'Oral',
  '10*10', 'STRIP', 'Amoxycillin 500 mg', 'Amoxycillin 500 mg', '~130–170 g',
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('MUPJI OINTMENT 10 GM', 'Used for various medical conditions; consult a physician for specific use.', 94.8728, ARRAY['Skin Care'], 0,
  'MUPJI OINTMENT 10 GM', '30049099', 0.05, 107.81, 'Ointment', 'topical',
  '10 GM', 'TUBE', 'Mupirocin 2% w/w Ointment', 'Mupirocin 2% w/w Ointment', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('MUSTBON-D3 DROPS 30 ML', 'Used for various medical conditions; consult a physician for specific use.', 86.6272, ARRAY['General / Other Care'], 0,
  'MUSTBON-D3 DROPS 30 ML', '30045036', 0.05, 98.44, 'Drops', 'Oral',
  '30 ML', 'MINI BOTTLE', 'Cholecalciferol 800 I.U Drops', 'Cholecalciferol 800 I.U Drops', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('MUSTBON-D3 NANO SHOT(B.SCOTCH) 5 ML', 'Used for various medical conditions; consult a physician for specific use.', 264, ARRAY['General / Other Care'], 0,
  'MUSTBON-D3 NANO SHOT(B.SCOTCH) 5 ML', '30045036', 0.05, 300, 'Nano shot', 'Oral',
  '5 ML', 'GLASS BOTTLE', 'Cholecalciferol 60000 Nano Shot', 'Cholecalciferol 60000 Nano Shot', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('MUSTBON-D3 NANO SHOTS(LICHI) 4*5ML', 'Used for various medical conditions; consult a physician for specific use.', 281.6, ARRAY['General / Other Care'], 0,
  'MUSTBON-D3 NANO SHOTS(LICHI) 4*5ML', '30049099', 0.05, 320, 'Nano shot', 'Oral',
  '4*5ML', 'GLASS BOTTLE', 'Cholecalciferol 60000 Nano Shot', 'Cholecalciferol 60000 Nano Shot', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('MUSTBON-D3 NANO SHOTS(STRWBRY) 4*5ML', 'Used for various medical conditions; consult a physician for specific use.', 281.6, ARRAY['General / Other Care'], 0,
  'MUSTBON-D3 NANO SHOTS(STRWBRY) 4*5ML', '30049099', 0.05, 320, 'Nano shot', 'Oral',
  '4*5ML', 'GLASS BOTTLE', 'Cholecalciferol 60000 Nano Shot', 'Cholecalciferol 60000 Nano Shot', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('MUSTBON-D3 SACHET 10*1 GM', 'Used for various medical conditions; consult a physician for specific use.', 305.2544, ARRAY['General / Other Care'], 0,
  'MUSTBON-D3 SACHET 10*1 GM', '300410', 0.05, 346.88, 'Sachet', 'Oral',
  '10*1 GM', 'PACKET', 'Cholecalciferol Granules 60000 i.u Sachets', 'Cholecalciferol Granules 60000 i.u Sachets', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('MUSTBON-D3 SG CAP 10*1*4', 'Used for various medical conditions; consult a physician for specific use.', 897.6, ARRAY['Skin Care'], 0,
  'MUSTBON-D3 SG CAP 10*1*4', '30045090', 0.05, 1020, 'Softgel Capsule', 'Oral',
  '10*1*4', 'STRIP', 'Cholecalciferol 60000 I.U Softgel Capsules', 'Cholecalciferol 60000 I.U Softgel Capsules', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('MUSTBON-D3 SG CAP 10*1*8', 'Used for various medical conditions; consult a physician for specific use.', 1892, ARRAY['Skin Care'], 0,
  'MUSTBON-D3 SG CAP 10*1*8', '30049099', 0.05, 2150, 'Softgel Capsule', 'Oral',
  '10*1*8', 'STRIP', 'Cholecalciferol 60000 I.U Softgel Capsules', 'Cholecalciferol 60000 I.U Softgel Capsules', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('NAXIVA-D 500 TAB 10*10', 'Used for various medical conditions; consult a physician for specific use.', 1410.7544, ARRAY['Digestive Care'], 0,
  'NAXIVA-D 500 TAB 10*10', '30049099', 0.05, 1603.13, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Naproxen Sodium 500 mg + Domperidone 10 mg', 'Naproxen Sodium 500 mg + Domperidone 10 mg', '~130–170 g',
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('NEBSMOL-G RESPULES 4*5*2 ML', 'Used for various medical conditions; consult a physician for specific use.', 915.2, ARRAY['Respiratory Care'], 0,
  'NEBSMOL-G RESPULES 4*5*2 ML', '85359010       85359010', 0.05, 1040, 'Respules', 'Oral',
  '4*5*2 ML', 'MINI BOTTLE', 'Glycopyrronium 25 mcg Inhalation Solution', 'Glycopyrronium 25 mcg Inhalation Solution', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('NECRABAC-1000 INJ 1 GM', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 58.6432, ARRAY['General / Other Care'], 0,
  'NECRABAC-1000 INJ 1 GM', '30042019', 0.05, 66.64, 'Injection', 'IV',
  '1 GM', 'VIAL', 'Ceftriaxone Sodium 1000 mg', 'Ceftriaxone Sodium 1000 mg', NULL,
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('NECRABAC-250 INJ 250 MG', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 26.628800000000002, ARRAY['General / Other Care'], 0,
  'NECRABAC-250 INJ 250 MG', '30042019', 0.05, 30.26, 'Injection', 'IV',
  '250 MG', 'VIAL', 'Ceftriaxone Sodium 250 mg', 'Ceftriaxone Sodium 250 mg', NULL,
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('NECRABAC-500 INJ 500 MG', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 47.2648, ARRAY['General / Other Care'], 0,
  'NECRABAC-500 INJ 500 MG', '30042019', 0.05, 53.71, 'Injection', 'IV',
  '500 MG', 'VIAL', 'Ceftriaxone Sodium 500 mg', 'Ceftriaxone Sodium 500 mg', NULL,
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('NECRABAC-SB 1500 INJ 1.5 GM', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 137.28, ARRAY['General / Other Care'], 0,
  'NECRABAC-SB 1500 INJ 1.5 GM', '30042019', 0.05, 156, 'Injection', 'IV',
  '1.5 GM', 'VIAL', 'Ceftriaxone Sodium 1000 mg + Sulbactam Sodium 500 mg', 'Ceftriaxone Sodium 1000 mg + Sulbactam Sodium 500 mg', NULL,
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('NECRABAC-SB 375 INJ 375 MG', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 50.3272, ARRAY['General / Other Care'], 0,
  'NECRABAC-SB 375 INJ 375 MG', '30042019', 0.05, 57.19, 'Injection', 'IV',
  '375 MG', 'VIAL', 'Ceftriaxone Sodium 250 mg + Sulbactam Sodium 125 mg', 'Ceftriaxone Sodium 250 mg + Sulbactam Sodium 125 mg', NULL,
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('NECRABAC-TZ 1.125 INJ 1.125GM', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 174.9, ARRAY['General / Other Care'], 0,
  'NECRABAC-TZ 1.125 INJ 1.125GM', '30042019', 0.05, 198.75, 'Injection', 'IV',
  '1.125GM', 'VIAL', 'Ceftriaxone Sodium 1000 mg + Tazobactam Sodium 125 mg', 'Ceftriaxone Sodium 1000 mg + Tazobactam Sodium 125 mg', NULL,
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('NEFLIT SYP 225 ML', 'Used for various medical conditions; consult a physician for specific use.', 144.3728, ARRAY['General / Other Care'], 0,
  'NEFLIT SYP 225 ML', '30049011', 0.05, 164.06, 'Syrup', 'Oral',
  '225 ML', 'BOTTLE', 'Herbal UTI Infection & Kidney Stone Syrup', 'Herbal UTI Infection & Kidney Stone Syrup', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('NEFLIT TAB 30 TAB', 'Used for various medical conditions; consult a physician for specific use.', 184.8, ARRAY['General / Other Care'], 0,
  'NEFLIT TAB 30 TAB', '30049011', 0.05, 210, 'Tablet', 'Oral',
  '30 TAB', 'JAR', 'Herbal UTI Infection & Kidney Stone Tablets', 'Herbal UTI Infection & Kidney Stone Tablets', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('NGMOL-2.6 TAB 30 TAB', 'Used for various medical conditions; consult a physician for specific use.', 160.8728, ARRAY['General / Other Care'], 0,
  'NGMOL-2.6 TAB 30 TAB', '30049099', 0.05, 182.81, 'Tablet', 'Oral',
  '30 TAB', 'JAR', 'Controlled Release Tablets of Nitroglycerin 2.6 mg', 'Controlled Release Tablets of Nitroglycerin 2.6 mg', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('NICOSPAN-5 TAB 10*10', 'Used for various medical conditions; consult a physician for specific use.', 1402.5, ARRAY['General / Other Care'], 0,
  'NICOSPAN-5 TAB 10*10', '30049099', 0.05, 1593.75, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Nicorandil 5 mg', 'Nicorandil 5 mg', '~130–170 g',
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('NITPAC-100 TAB 10*14', 'Used for various medical conditions; consult a physician for specific use.', 1066.0672, ARRAY['General / Other Care'], 0,
  'NITPAC-100 TAB 10*14', '30049099', 0.05, 1211.44, 'Tablet', 'Oral',
  '10*14', 'STRIP', 'Nitrofurantoin 100 mg (Sustained Release)', 'Nitrofurantoin 100 mg (Sustained Release)', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('NVGON TAB 10*10', 'Nutritional supplement for bone health, nerve health, or immunity', 643.5, ARRAY['Nutritional Supplement'], 0,
  'NVGON TAB 10*10', '30045010', 0.05, 731.25, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Doxylamine Succinate 10 mg + Pyridoxine HCL 10 mg + Folic Acid 2.5 mg', 'Doxylamine Succinate 10 mg + Pyridoxine HCL 10 mg + Folic Acid 2.5 mg', '~130–170 g',
  'Nutritional supplement for bone health, nerve health, or immunity', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('NVGON-OD TAB 10*10', 'Nutritional supplement for bone health, nerve health, or immunity', 1278.7544, ARRAY['Nutritional Supplement'], 0,
  'NVGON-OD TAB 10*10', '30045010', 0.05, 1453.13, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Doxylamine Succinate 20 mg + Pyridoxine Hydrochloride 20 mg & Folic Acid 5 mg', 'Doxylamine Succinate 20 mg + Pyridoxine Hydrochloride 20 mg & Folic Acid 5 mg', '~130–170 g',
  'Nutritional supplement for bone health, nerve health, or immunity', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('OVLANDER-L TAB 10*1*21', 'Used for various medical conditions; consult a physician for specific use.', 642.4, ARRAY['General / Other Care'], 0,
  'OVLANDER-L TAB 10*1*21', '30066020', NULL, 730, 'Tablet', 'Oral',
  '10*1*21', 'STRIP', 'Levonorgestrel 150 mcg + Ethinylestradiol 30 mcg', 'Levonorgestrel 150 mcg + Ethinylestradiol 30 mcg', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('PEDIBLOW SOAP 75 GM', 'Used for various medical conditions; consult a physician for specific use.', 97.9, ARRAY['Skin Care'], 0,
  'PEDIBLOW SOAP 75 GM', '34011110', 0.05, 111.25, 'Soap', 'topical',
  '75 GM', 'BOX', 'Permethrin 5% w/w', 'Permethrin 5% w/w', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('PEDIBLOW-C SOAP 75 GM', 'Used for various medical conditions; consult a physician for specific use.', 101.816, ARRAY['Skin Care'], 0,
  'PEDIBLOW-C SOAP 75 GM', '34011110', 0.05, 115.7, 'Soap', 'topical',
  '75 GM', 'BOX', 'Permethrin 1% w/w & Cetrimide 0.5% w/w', 'Permethrin 1% w/w & Cetrimide 0.5% w/w', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('PEGZAP POWDER 119 GM', 'Used for various medical conditions; consult a physician for specific use.', 308, ARRAY['General / Other Care'], 0,
  'PEGZAP POWDER 119 GM', '30049099', 0.05, 350, 'Powder', 'Oral',
  '119 GM', 'JAR', 'Polyethylene Glycol 3350 Powder for Oral Solution', 'Polyethylene Glycol 3350 Powder for Oral Solution', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('PICJI SYP 100 ML', 'Used for various medical conditions; consult a physician for specific use.', 88.2728, ARRAY['General / Other Care'], 0,
  'PICJI SYP 100 ML', '30049099', 0.05, 100.31, 'Syrup', 'Oral',
  '100 ML', 'BOTTLE', 'Sodium Picosulfate 5 mg (Sugar Free)', 'Sodium Picosulfate 5 mg (Sugar Free)', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('PIPSTOC-4.5 INJ 4.5 GM', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 328.3544, ARRAY['General / Other Care'], 0,
  'PIPSTOC-4.5 INJ 4.5 GM', '30041090', 0.05, 373.13, 'Injection', 'IV',
  '4.5 GM', 'VIAL', 'Piperacillin Sodium 4 gm + Tazobactam Sodium 0.5 gm', 'Piperacillin Sodium 4 gm + Tazobactam Sodium 0.5 gm', NULL,
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('PLANSCAR GEL 20 GM', 'Used for various medical conditions; consult a physician for specific use.', 161.92, ARRAY['Skin Care'], 0,
  'PLANSCAR GEL 20 GM', '30049099', 0.05, 184, 'Gel', 'topical',
  '20 GM', 'TUBE', 'Human Placenta Extract Gel', 'Human Placenta Extract Gel', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('PLATSTOR SYP 225 ML', 'Used for various medical conditions; consult a physician for specific use.', 160.8728, ARRAY['General / Other Care'], 0,
  'PLATSTOR SYP 225 ML', '30049011', 0.05, 182.81, 'Syrup', 'Oral',
  '225 ML', 'BOTTLE', 'Carica Papaya Leaf Extract, Tinospora Cordifolia Extract & Goat Milk Powder Syrup', 'Carica Papaya Leaf Extract, Tinospora Cordifolia Extract & Goat Milk Powder Syrup', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('PLATSTOR TAB 10*1*10', 'Used for various medical conditions; consult a physician for specific use.', 1856.2544, ARRAY['General / Other Care'], 0,
  'PLATSTOR TAB 10*1*10', '30039011', 0.05, 2109.38, 'Tablet', 'Oral',
  '10*1*10', 'STRIP', 'Carica Papaya Leaf Extract, Tinospora Cordifolia Extract & Goat Milk Powder Tablets', 'Carica Papaya Leaf Extract, Tinospora Cordifolia Extract & Goat Milk Powder Tablets', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('PREDIPIL-16 TAB 10*10', 'Used for various medical conditions; consult a physician for specific use.', 1097.2544, ARRAY['General / Other Care'], 0,
  'PREDIPIL-16 TAB 10*10', '30043912', 0.05, 1246.88, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Methyl Prednisolone 16 mg', 'Methyl Prednisolone 16 mg', '~130–170 g',
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('PREDIPIL-4 TAB 10*10', 'Used for various medical conditions; consult a physician for specific use.', 478.5, ARRAY['General / Other Care'], 0,
  'PREDIPIL-4 TAB 10*10', '30049099', 0.05, 543.75, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Methyl Prednisolone 4 mg', 'Methyl Prednisolone 4 mg', '~130–170 g',
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('PREDIPIL-8 TAB 10*10', 'Used for various medical conditions; consult a physician for specific use.', 627, ARRAY['General / Other Care'], 0,
  'PREDIPIL-8 TAB 10*10', '30043912', 0.05, 712.5, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Methyl Prednisolone 8 mg', 'Methyl Prednisolone 8 mg', '~130–170 g',
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('PREDIPIL-A INJ 2 ML', 'Used for various medical conditions; consult a physician for specific use.', 91.5816, ARRAY['General / Other Care'], 0,
  'PREDIPIL-A INJ 2 ML', '30049069', 0.05, 104.07, 'Injection', 'IV',
  '2 ML', 'VIAL', 'Methylprednisolone Acetate 40 mg/ml', 'Methylprednisolone Acetate 40 mg/ml', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('PRESTIMOL INJ 40MG/1ML', 'Used for various medical conditions; consult a physician for specific use.', 86.6272, ARRAY['General / Other Care'], 0,
  'PRESTIMOL INJ 40MG/1ML', '30049099', 0.05, 98.44, 'Injection', 'IV',
  '40MG/1ML', 'VIAL', 'Triamcinolone Acetonide 40 mg/ml', 'Triamcinolone Acetonide 40 mg/ml', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('PRIKMIK-100 INJ 2 ML', 'Used for various medical conditions; consult a physician for specific use.', 50.908, ARRAY['General / Other Care'], 0,
  'PRIKMIK-100 INJ 2 ML', '30049099', 0.05, 57.85, 'Injection', 'IV',
  '2 ML', 'VIAL', 'Amikacin 100 mg', 'Amikacin 100 mg', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('PRIKMIK-250 INJ 2 ML', 'Used for various medical conditions; consult a physician for specific use.', 101.816, ARRAY['General / Other Care'], 0,
  'PRIKMIK-250 INJ 2 ML', '30049099', 0.05, 115.7, 'Injection', 'IV',
  '2 ML', 'VIAL', 'Amikacin 250 mg', 'Amikacin 250 mg', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('PRIKMIK-500 INJ 2 ML', 'Used for various medical conditions; consult a physician for specific use.', 101.2, ARRAY['General / Other Care'], 0,
  'PRIKMIK-500 INJ 2 ML', '30049099', 0.05, 115, 'Injection', 'IV',
  '2 ML', 'VIAL', 'Amikacin 500 mg', 'Amikacin 500 mg', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('PRIKNATE-120 INJ 120MG/VIAL', 'Used for various medical conditions; consult a physician for specific use.', 419.76, ARRAY['General / Other Care'], 0,
  'PRIKNATE-120 INJ 120MG/VIAL', '30049059', 0.05, 477, 'Injection', 'IV',
  '120MG/VIAL', 'VIAL', 'Artesunate 120 mg', 'Artesunate 120 mg', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('PRIKNATE-60 INJ 60MG/VIAL', 'Used for various medical conditions; consult a physician for specific use.', 224.2416, ARRAY['General / Other Care'], 0,
  'PRIKNATE-60 INJ 60MG/VIAL', '30049059', 0.05, 254.82, 'Injection', 'IV',
  '60MG/VIAL', 'VIAL', 'Artesunate 60 mg', 'Artesunate 60 mg', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('PYROSTOP DROPS 15 ML', 'Pain relief, inflammation, muscle spasms, and fever', 39.6, ARRAY['Pain / Muscle Care'], 0,
  'PYROSTOP DROPS 15 ML', '30049099', 0.05, 45, 'Drops', 'Oral',
  '15 ML', 'GLASS BOTTLE', 'Paracetamol 150 mg', 'Paracetamol 150 mg', NULL,
  'Pain relief, inflammation, muscle spasms, and fever', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('PYROSTOP-1K TAB 10*10', 'Pain relief, inflammation, muscle spasms, and fever', 618.7544, ARRAY['Pain / Muscle Care'], 0,
  'PYROSTOP-1K TAB 10*10', '30049069', 0.05, 703.13, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Paracetamol Immediate Release 300 mg and Paracetamol Sustained Release 700 mg', 'Paracetamol Immediate Release 300 mg and Paracetamol Sustained Release 700 mg', '~130–170 g',
  'Pain relief, inflammation, muscle spasms, and fever', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('PYROSTOP-250 SUSP 60 ML', 'Pain relief, inflammation, muscle spasms, and fever', 37.144800000000004, ARRAY['Pain / Muscle Care'], 0,
  'PYROSTOP-250 SUSP 60 ML', '30049099', 0.05, 42.21, 'Suspension', 'Oral',
  '60 ML', 'BOTTLE', 'Paracetamol 250 mg', 'Paracetamol 250 mg', NULL,
  'Pain relief, inflammation, muscle spasms, and fever', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('PYROSTOP-500 TAB 10*15', 'Pain relief, inflammation, muscle spasms, and fever', 127.512, ARRAY['Pain / Muscle Care'], 0,
  'PYROSTOP-500 TAB 10*15', '30049099', 0.05, 144.9, 'Tablet', 'Oral',
  '10*15', 'STRIP', 'Paracetamol 500 mg', 'Paracetamol 500 mg', NULL,
  'Pain relief, inflammation, muscle spasms, and fever', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('PYROSTOP-650 TAB 10*15', 'Pain relief, inflammation, muscle spasms, and fever', 282.656, ARRAY['Pain / Muscle Care'], 0,
  'PYROSTOP-650 TAB 10*15', '30049069', 0.05, 321.2, 'Tablet', 'Oral',
  '10*15', 'STRIP', 'Paracetamol 650 mg', 'Paracetamol 650 mg', NULL,
  'Pain relief, inflammation, muscle spasms, and fever', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('PYROSTOP-IV INFUSION 100 ML', 'Pain relief, inflammation, muscle spasms, and fever', 288.7544, ARRAY['Pain / Muscle Care'], 0,
  'PYROSTOP-IV INFUSION 100 ML', '30049099', 0.05, 328.13, 'Infusion', 'IV',
  '100 ML', 'VIAL', 'Paracetamol 1000 mg', 'Paracetamol 1000 mg', NULL,
  'Pain relief, inflammation, muscle spasms, and fever', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('RAFGARD-SB 1500 INJ 1.5 GM', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 246.6728, ARRAY['General / Other Care'], 0,
  'RAFGARD-SB 1500 INJ 1.5 GM', '30042019', 0.05, 280.31, 'Injection', 'IV',
  '1.5 GM', 'VIAL', 'Cefoperazone 1000 mg + Sulbactam 500 mg', 'Cefoperazone 1000 mg + Sulbactam 500 mg', NULL,
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('RECPILL TAB 10*10', 'Used for various medical conditions; consult a physician for specific use.', 2020.48, ARRAY['Pain / Muscle Care'], 0,
  'RECPILL TAB 10*10', '30049099', 0.05, 2296, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Trypsin 48 mg + Bromelain 90 mg + Rutoside Trihydrate 100 mg', 'Trypsin 48 mg + Bromelain 90 mg + Rutoside Trihydrate 100 mg', '~130–170 g',
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('RECPILL-D TAB 10*10', 'Pain relief, inflammation, muscle spasms, and fever', 2144.56, ARRAY['Pain / Muscle Care'], 0,
  'RECPILL-D TAB 10*10', '30049084', 0.05, 2437, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Trypsin 48 mg + Bromelain 90 mg + Rutoside Trihydrate 100 mg + Diclofenac Sodium 50 mg', 'Trypsin 48 mg + Bromelain 90 mg + Rutoside Trihydrate 100 mg + Diclofenac Sodium 50 mg', '~130–170 g',
  'Pain relief, inflammation, muscle spasms, and fever', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('RECPILL-DS TAB 10*1*10', 'Used for various medical conditions; consult a physician for specific use.', 3960, ARRAY['Pain / Muscle Care'], 0,
  'RECPILL-DS TAB 10*1*10', '30049084', 0.05, 4500, 'Tablet', 'Oral',
  '10*1*10', 'STRIP', 'Trypsin 96 mg + Bromelain 180 mg + Rutoside Trihydrate 200 mg', 'Trypsin 96 mg + Bromelain 180 mg + Rutoside Trihydrate 200 mg', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('RIDSCLAV DRY SYP 30 ML', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 57.1032, ARRAY['Infection Care'], 0,
  'RIDSCLAV DRY SYP 30 ML', '30041030', 0.05, 64.89, 'Dry syrup', 'Oral',
  '30 ML', 'GLASS BOTTLE', 'Amoxycillin 200 mg & Potassium Clavulanate 28.5/5 ml (Sterile Water)', 'Amoxycillin 200 mg & Potassium Clavulanate 28.5/5 ml (Sterile Water)', NULL,
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('RIDSCLAV-1000 TAB 10*1*10', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 5115, ARRAY['Infection Care'], 0,
  'RIDSCLAV-1000 TAB 10*1*10', '30041030', 0.05, 5812.5, 'Tablet', 'Oral',
  '10*1*10', 'STRIP', 'Amoxycillin 875 mg + Potassium Clavulanate 125 mg', 'Amoxycillin 875 mg + Potassium Clavulanate 125 mg', NULL,
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('RIDSCLAV-375 TAB 10*10', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 2021.2544, ARRAY['Infection Care'], 0,
  'RIDSCLAV-375 TAB 10*10', '30041030', 0.05, 2296.88, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Amoxycillin 250 mg + Potassium Clavulanate 125 mg', 'Amoxycillin 250 mg + Potassium Clavulanate 125 mg', '~130–170 g',
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('RIDSCLAV-625 TAB (STRIP) 10*1*10', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 1720.4879999999998, ARRAY['Infection Care'], 0,
  'RIDSCLAV-625 TAB (STRIP) 10*1*10', '30041030', 0.05, 1955.1, 'Tablet', 'Oral',
  '10*1*10', 'STRIP', 'Amoxycillin 500 mg + Potassium Clavulanate 125 mg', 'Amoxycillin 500 mg + Potassium Clavulanate 125 mg', NULL,
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('RIDSCLAV-625 TAB (STRIP) 10*1*6', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 1032.24, ARRAY['Infection Care'], 0,
  'RIDSCLAV-625 TAB (STRIP) 10*1*6', '30041030', 0.05, 1173, 'Tablet', 'Oral',
  '10*1*6', 'STRIP', 'Amoxycillin 500 mg + Potassium Clavulanate 125 mg', 'Amoxycillin 500 mg + Potassium Clavulanate 125 mg', NULL,
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('RIDSCLAV-625 TAB 10*10', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 1720.4879999999998, ARRAY['Infection Care'], 0,
  'RIDSCLAV-625 TAB 10*10', '30041030', 0.05, 1955.1, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Amoxycillin 500 mg + Potassium Clavulanate 125 mg', 'Amoxycillin 500 mg + Potassium Clavulanate 125 mg', '~130–170 g',
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('RIDSCLAV-DDS DRY SYP 30 ML', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 138.6, ARRAY['Infection Care'], 0,
  'RIDSCLAV-DDS DRY SYP 30 ML', '30041030', 0.05, 157.5, 'Dry syrup', 'Oral',
  '30 ML', 'GLASS BOTTLE', 'Amoxycillin 400 mg & Potassium Clavulanate 57 mg/5ml (Sterile Water)', 'Amoxycillin 400 mg & Potassium Clavulanate 57 mg/5ml (Sterile Water)', NULL,
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('RIDSCLAV-LB 625 TAB 10*1*10', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 2226.4, ARRAY['Infection Care'], 0,
  'RIDSCLAV-LB 625 TAB 10*1*10', '30041030', 0.05, 2530, 'Tablet', 'Oral',
  '10*1*10', 'STRIP', 'Amoxycillin 500 mg + Potassium Clavulanate 125 mg + Lactic Acid Bacillus', 'Amoxycillin 500 mg + Potassium Clavulanate 125 mg + Lactic Acid Bacillus', NULL,
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('ROXBANG-150 TAB 10*10', 'Used for various medical conditions; consult a physician for specific use.', 1408, ARRAY['General / Other Care'], 0,
  'ROXBANG-150 TAB 10*10', '30049099', 0.05, 1600, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Roxithromycin 150 mg', 'Roxithromycin 150 mg', '~130–170 g',
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('SCADILAN-40 SR TAB 10*10', 'Used for various medical conditions; consult a physician for specific use.', 792, ARRAY['General / Other Care'], 0,
  'SCADILAN-40 SR TAB 10*10', '30049099', 0.05, 900, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Isoxsuprine Hydrochloride 40 mg Sustained Release', 'Isoxsuprine Hydrochloride 40 mg Sustained Release', '~130–170 g',
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('STERONOR-10 CR TAB 10*10', 'Used for various medical conditions; consult a physician for specific use.', 997.92, ARRAY['General / Other Care'], 0,
  'STERONOR-10 CR TAB 10*10', '30043919', 0.05, 1134, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Norethisterone 10 mg Controlled Release', 'Norethisterone 10 mg Controlled Release', '~130–170 g',
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('STERONOR-5 TAB 10*10', 'Used for various medical conditions; consult a physician for specific use.', 497.9744, ARRAY['General / Other Care'], 0,
  'STERONOR-5 TAB 10*10', '30043919', 0.05, 565.88, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Norethisterone 5 mg', 'Norethisterone 5 mg', '~130–170 g',
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('SULTREK-375 TAB 10*1*10', 'Used for various medical conditions; consult a physician for specific use.', 4320.8, ARRAY['General / Other Care'], 0,
  'SULTREK-375 TAB 10*1*10', '30049099', 0.05, 4910, 'Tablet', 'Oral',
  '10*1*10', 'STRIP', 'Sultamicillin 375 mg', 'Sultamicillin 375 mg', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('SUPER SIGHT SG CAP 10*1*10', 'Nutritional supplement for bone health, nerve health, or immunity', 1760, ARRAY['Skin Care'], 0,
  'SUPER SIGHT SG CAP 10*1*10', '29362390', 0.05, 2000, 'Softgel Capsule', 'Oral',
  '10*1*10', 'STRIP', 'Lutein 20 mg + Zeaxanthin 4 mg + Astaxanthin 7.5 mg + Bilberry Extract 50 mg + Lycopene 5 mg + Beta Carotene 10 mg + Citrus Bioflavonoids 20 mg + Zinc 17 mg + Niacinamide 18 mg + Iron 19 mg + Vitamin A 600 mcg + Vitamin E 10 mg + Vitamin C 50 mg Softgel Capsules', 'Lutein 20 mg + Zeaxanthin 4 mg + Astaxanthin 7.5 mg + Bilberry Extract 50 mg + Lycopene 5 mg + Beta Carotene 10 mg + Citrus Bioflavonoids 20 mg + Zinc 17 mg + Niacinamide 18 mg + Iron 19 mg + Vitamin A 600 mcg + Vitamin E 10 mg + Vitamin C 50 mg Softgel Capsules', NULL,
  'Nutritional supplement for bone health, nerve health, or immunity', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('SYNCRAB-20 INJ 20 MG', 'Acidity, heartburn, stomach ulcers, and GERD', 88.2728, ARRAY['Digestive Care'], 0,
  'SYNCRAB-20 INJ 20 MG', '30049039', 0.05, 100.31, 'Injection', 'IV',
  '20 MG', 'VIAL', 'Rabeprazole Sodium 20 mg', 'Rabeprazole Sodium 20 mg', NULL,
  'Acidity, heartburn, stomach ulcers, and GERD', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('SYNCRAB-20 TAB 10*10', 'Acidity, heartburn, stomach ulcers, and GERD', 495, ARRAY['Digestive Care'], 0,
  'SYNCRAB-20 TAB 10*10', '30049039', 0.05, 562.5, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Rabeprazole Sodium 20 mg', 'Rabeprazole Sodium 20 mg', '~130–170 g',
  'Acidity, heartburn, stomach ulcers, and GERD', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('SYNCRAB-D TAB 10*10', 'Acidity, heartburn, stomach ulcers, and GERD', 643.5, ARRAY['Digestive Care'], 0,
  'SYNCRAB-D TAB 10*10', '30049039', 0.05, 731.25, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Rabeprazole Sodium 20 mg + Domperidone 10 mg', 'Rabeprazole Sodium 20 mg + Domperidone 10 mg', '~130–170 g',
  'Acidity, heartburn, stomach ulcers, and GERD', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('SYNCRAB-DSR CAP 10*10', 'Acidity, heartburn, stomach ulcers, and GERD', 941.6, ARRAY['Digestive Care'], 0,
  'SYNCRAB-DSR CAP 10*10', '30049039', 0.05, 1070, 'Capsule', 'Oral',
  '10*10', 'STRIP', 'Rabeprazole 20 mg (EC) + Domperidone 30 mg (SR)', 'Rabeprazole 20 mg (EC) + Domperidone 30 mg (SR)', '~130–170 g',
  'Acidity, heartburn, stomach ulcers, and GERD', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('SYNCRAB-L CAP 10*10', 'Acidity, heartburn, stomach ulcers, and GERD', 2144.56, ARRAY['Digestive Care'], 0,
  'SYNCRAB-L CAP 10*10', '30049039', 0.05, 2437, 'Capsule', 'Oral',
  '10*10', 'STRIP', 'Rabeprazole 20 mg (EC) + Levosulpiride 75 mg (SR)', 'Rabeprazole 20 mg (EC) + Levosulpiride 75 mg (SR)', '~130–170 g',
  'Acidity, heartburn, stomach ulcers, and GERD', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('SYNCRAB-O TAB 10*15', 'Acidity, heartburn, stomach ulcers, and GERD', 1113.7544, ARRAY['Digestive Care'], 0,
  'SYNCRAB-O TAB 10*15', '30049039', 0.05, 1265.63, 'Tablet', 'Oral',
  '10*15', 'STRIP', 'Rabeprazole 20 mg + Ondansetron 4 mg', 'Rabeprazole 20 mg + Ondansetron 4 mg', NULL,
  'Acidity, heartburn, stomach ulcers, and GERD', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('TICABELL TAB 10*14', 'Used for various medical conditions; consult a physician for specific use.', 3080, ARRAY['General / Other Care'], 0,
  'TICABELL TAB 10*14', '30049099', 0.05, 3500, 'Tablet', 'Oral',
  '10*14', 'STRIP', 'Ticagrelor 90 mg', 'Ticagrelor 90 mg', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('TOM 8O PLUS SYP 225 ML', 'Nutritional supplement for bone health, nerve health, or immunity', 140.976, ARRAY['Nutritional Supplement'], 0,
  'TOM 8O PLUS SYP 225 ML', '21069099', 0.05, 160.2, 'Syrup', 'Oral',
  '225 ML', 'BOTTLE', 'Lycopene 6% 1000 mcg + Vitamin A 2000 IU + Vitamin E 10 IU + Vitamin C 40 mg + Zinc 3 mg + Iodine 100 mcg + Copper 500 mcg + Thiamine Hydrochloride 1.4 mg + Riboflavin 1.6 mg + Pyridoxine Hydrochloride 1.5 mg', 'Lycopene 6% 1000 mcg + Vitamin A 2000 IU + Vitamin E 10 IU + Vitamin C 40 mg + Zinc 3 mg + Iodine 100 mcg + Copper 500 mcg + Thiamine Hydrochloride 1.4 mg + Riboflavin 1.6 mg + Pyridoxine Hydrochloride 1.5 mg', NULL,
  'Nutritional supplement for bone health, nerve health, or immunity', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('TORCHWIN CAP 10*10', 'Used for various medical conditions; consult a physician for specific use.', 1012, ARRAY['General / Other Care'], 0,
  'TORCHWIN CAP 10*10', '30049011', 0.05, 1150, 'Capsule', 'Oral',
  '10*10', 'STRIP', 'Herbal Immuno-Modulator for Safe Motherhood (Mulethi, Giloy, Kantheri, Badi Kateri, Piplamool, Gokhru Chota, Bharangi, Anar, Khas, Rasna, Manjishta, Gond Katira) Capsules', 'Herbal Immuno-Modulator for Safe Motherhood (Mulethi, Giloy, Kantheri, Badi Kateri, Piplamool, Gokhru Chota, Bharangi, Anar, Khas, Rasna, Manjishta, Gond Katira) Capsules', '~130–170 g',
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('TRUSLIDE-P TAB BLUE 20*10', 'Pain relief, inflammation, muscle spasms, and fever', 739.2, ARRAY['Pain / Muscle Care'], 0,
  'TRUSLIDE-P TAB BLUE 20*10', '300490', 0.05, 840, 'Tablet', 'Oral',
  '20*10', 'STRIP', 'Nimesulide 100 mg + Paracetamol 325 mg', 'Nimesulide 100 mg + Paracetamol 325 mg', NULL,
  'Pain relief, inflammation, muscle spasms, and fever', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('TRUSLIDE-P TAB GOLDEN 20*10', 'Pain relief, inflammation, muscle spasms, and fever', 739.2, ARRAY['Pain / Muscle Care'], 0,
  'TRUSLIDE-P TAB GOLDEN 20*10', '30049099', 0.05, 840, 'Tablet', 'Oral',
  '20*10', 'STRIP', 'Nimesulide 100 mg + Paracetamol 325 mg', 'Nimesulide 100 mg + Paracetamol 325 mg', NULL,
  'Pain relief, inflammation, muscle spasms, and fever', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('TUMSGARD SUSP 150 ML', 'Nutritional supplement for bone health, nerve health, or immunity', 162.8, ARRAY['Nutritional Supplement'], 0,
  'TUMSGARD SUSP 150 ML', '30049032', 0.05, 185, 'Suspension', 'Oral',
  '150 ML', 'BOTTLE', 'Sodium Alginate 250 mg + Sodium Bicarbonate 133.5 mg + Calcium Carbonate 80 mg Suspension', 'Sodium Alginate 250 mg + Sodium Bicarbonate 133.5 mg + Calcium Carbonate 80 mg Suspension', NULL,
  'Nutritional supplement for bone health, nerve health, or immunity', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('VATSLA CAP 10*10', 'Used for various medical conditions; consult a physician for specific use.', 660, ARRAY['General / Other Care'], 0,
  'VATSLA CAP 10*10', '30049011', 0.05, 750, 'Capsule', 'Oral',
  '10*10', 'STRIP', 'Herbal Uterine Capsules', 'Herbal Uterine Capsules', '~130–170 g',
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('VATSLA SYP 225 ML', 'Used for various medical conditions; consult a physician for specific use.', 140.2544, ARRAY['General / Other Care'], 0,
  'VATSLA SYP 225 ML', '30049011', 0.05, 159.38, 'Syrup', 'Oral',
  '225 ML', 'BOTTLE', 'Herbal Uterine Tonic', 'Herbal Uterine Tonic', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('VENSEREN-50 ER TAB 10*10', 'Used for various medical conditions; consult a physician for specific use.', 1402.5, ARRAY['General / Other Care'], 0,
  'VENSEREN-50 ER TAB 10*10', '30049099', 0.05, 1593.75, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Desvenlafaxine Extended Release 50 mg', 'Desvenlafaxine Extended Release 50 mg', '~130–170 g',
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('VENTHROM OINTMENT 30 GM', 'Used for various medical conditions; consult a physician for specific use.', 167.2, ARRAY['Skin Care'], 0,
  'VENTHROM OINTMENT 30 GM', '30049099', 0.05, 190, 'Ointment', 'topical',
  '30 GM', 'TUBE', 'Heparin Sodium 50 IU + Benzyl Nicotinate 2 mg', 'Heparin Sodium 50 IU + Benzyl Nicotinate 2 mg', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('VISTALOC-25 TAB 10*15', 'Used for various medical conditions; consult a physician for specific use.', 800.8, ARRAY['General / Other Care'], 0,
  'VISTALOC-25 TAB 10*15', '30049099', 0.05, 910, 'Tablet', 'Oral',
  '10*15', 'STRIP', 'Hydroxyzine Hydrochloride 25 mg', 'Hydroxyzine Hydrochloride 25 mg', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('VOLKSLIV INJ 1*10ML', 'Liver health and Liver disorders', 284.6272, ARRAY['General / Other Care'], 0,
  'VOLKSLIV INJ 1*10ML', '30049069', 0.05, 323.44, 'Injection', 'IV',
  '1*10ML', 'VIAL', 'L-Ornithine L-Aspartate Infusion Concentrate 5 gm', 'L-Ornithine L-Aspartate Infusion Concentrate 5 gm', NULL,
  'Liver health and Liver disorders', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('VOLKSLIV SYP 100 ML 100 ML', 'Liver health and Liver disorders', 70.4, ARRAY['Nutritional Supplement'], 0,
  'VOLKSLIV SYP 100 ML 100 ML', '21069099', 0.05, 80, 'Syrup', 'Oral',
  '100 ML', 'BOTTLE', 'Silymarin, L-Ornithine L-Aspartate & Vitamin BComplex (Sugar Free)', 'Silymarin, L-Ornithine L-Aspartate & Vitamin BComplex (Sugar Free)', NULL,
  'Liver health and Liver disorders', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('VOLKSLIV SYP 225 ML 225 ML', 'Liver health and Liver disorders', 140.8, ARRAY['Nutritional Supplement'], 0,
  'VOLKSLIV SYP 225 ML 225 ML', '21069099', 0.05, 160, 'Syrup', 'Oral',
  '225 ML', 'BOTTLE', 'Silymarin, L-Ornithine L-Aspartate & Vitamin BComplex (Sugar Free)', 'Silymarin, L-Ornithine L-Aspartate & Vitamin BComplex (Sugar Free)', NULL,
  'Liver health and Liver disorders', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('VOLKSMIN OSTEO 200 GM', 'Used for various medical conditions; consult a physician for specific use.', 368.72, ARRAY['General / Other Care'], 0,
  'VOLKSMIN OSTEO 200 GM', '21069099', 0.05, 419, 'Protien powder', 'Oral',
  '200 GM', 'JAR', 'Nutrition Powder for Bones (Vanilla Flavour)', 'Nutrition Powder for Bones (Vanilla Flavour)', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('VOLKSMIN SYP 300 ML', 'Nutritional supplement for bone health, nerve health, or immunity', 177.3728, ARRAY['Nutritional Supplement'], 0,
  'VOLKSMIN SYP 300 ML', '30049099', 0.05, 201.56, 'Syrup', 'Oral',
  '300 ML', 'BOTTLE', 'Iodised Peptone 0.322 mg + Magnesium Chloride 6.67 mg + Manganese Sulphate 1.33 mg + Sodium Metavanadate 0.22 mg + Zinc Sulphate 10.71 mg + Pyridoxine Hcl 0.25 mg + Cyanocobalamin 0.167 mcg + Nicotinamide 3.33 mg Syrup', 'Iodised Peptone 0.322 mg + Magnesium Chloride 6.67 mg + Manganese Sulphate 1.33 mg + Sodium Metavanadate 0.22 mg + Zinc Sulphate 10.71 mg + Pyridoxine Hcl 0.25 mg + Cyanocobalamin 0.167 mcg + Nicotinamide 3.33 mg Syrup', NULL,
  'Nutritional supplement for bone health, nerve health, or immunity', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('VOLKSMIN-FORTE CAP 10*1*10', 'Used for various medical conditions; consult a physician for specific use.', 1151.04, ARRAY['Nutritional Supplement'], 0,
  'VOLKSMIN-FORTE CAP 10*1*10', '21069099', 0.05, 1308, 'Capsule', 'Oral',
  '10*1*10', 'STRIP', 'Amino Acids & Vitamin Capsules', 'Amino Acids & Vitamin Capsules', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('VOLKSMIN-MAMA CHOCOLATE 200 GM', 'Used for various medical conditions; consult a physician for specific use.', 343.2, ARRAY['General / Other Care'], 0,
  'VOLKSMIN-MAMA CHOCOLATE 200 GM', '21069099', 0.05, 390, 'Protien powder', 'Oral',
  '200 GM', 'JAR', 'Complete nutrition for would-be moms • No added sugar6, Choclate flavour', 'Complete nutrition for would-be moms • No added sugar6, Choclate flavour', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('VOLKSMIN-MAMA VANILLA FLAVOUR 200 GM', 'Used for various medical conditions; consult a physician for specific use.', 343.2, ARRAY['General / Other Care'], 0,
  'VOLKSMIN-MAMA VANILLA FLAVOUR 200 GM', '21069099', 0.05, 390, 'Protien powder', 'Oral',
  '200 GM', 'JAR', 'Complete nutrition for would-be moms • No added sugar • Vanilla flavour', 'Complete nutrition for would-be moms • No added sugar • Vanilla flavour', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('VOLKSMIN-RG SACHET 20*5 GM', 'Nutritional supplement for bone health, nerve health, or immunity', 704, ARRAY['Nutritional Supplement'], 0,
  'VOLKSMIN-RG SACHET 20*5 GM', '21069099', 0.05, 800, 'Sachet', 'Oral',
  '20*5 GM', 'PACKET', 'L-Arginine, Proanthocyanidin, Folic acid, Vitamin B6 & DHA Sachets', 'L-Arginine, Proanthocyanidin, Folic acid, Vitamin B6 & DHA Sachets', NULL,
  'Nutritional supplement for bone health, nerve health, or immunity', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('VOLKSMIN-SE 20 ML', 'Used for various medical conditions; consult a physician for specific use.', 158.4, ARRAY['General / Other Care'], 0,
  'VOLKSMIN-SE 20 ML', '30049099', 0.05, 180, 'Infusion', 'IV',
  '20 ML', 'VIAL', 'Nutritive Infusion of Pure Crystalline Amino Acid', 'Nutritive Infusion of Pure Crystalline Amino Acid', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('VOLKSMIN-SN 200 ML', 'Used for various medical conditions; consult a physician for specific use.', 567.6, ARRAY['General / Other Care'], 0,
  'VOLKSMIN-SN 200 ML', '30049099', 0.05, 645, 'Infusion', 'IV',
  '200 ML', 'VIAL', 'Pure Crystalline Amino Acids IV Infusion with Xylitol', 'Pure Crystalline Amino Acids IV Infusion with Xylitol', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('VOLKSVIT LB SG CAP 10*10', 'Nutritional supplement for bone health, nerve health, or immunity', 545.6, ARRAY['Nutritional Supplement'], 0,
  'VOLKSVIT LB SG CAP 10*10', '29362390', 0.05, 620, 'Softgel Capsule', 'Oral',
  '10*10', 'STRIP', 'Vitamin C 40 mg, Niacin 16 mg, Vitamin E 10 mg, Pantothenic acid 4.5 mg, Vitamin B2 1.4 mg, Vitamin B6 1.2 mg, Vitamin B1 1.2 mg, Vitamin A 600 mcg, Folic acid 1 mcg, Vitamin B12 1 mcg, Zinc 10 mg, Manganese 2 mg, Copper 1.7 mg, Selenium 35 mcg, Bacillus coagulans 100 million', 'Vitamin C 40 mg, Niacin 16 mg, Vitamin E 10 mg, Pantothenic acid 4.5 mg, Vitamin B2 1.4 mg, Vitamin B6 1.2 mg, Vitamin B1 1.2 mg, Vitamin A 600 mcg, Folic acid 1 mcg, Vitamin B12 1 mcg, Zinc 10 mg, Manganese 2 mg, Copper 1.7 mg, Selenium 35 mcg, Bacillus coagulans 100 million', '~130–170 g',
  'Nutritional supplement for bone health, nerve health, or immunity', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('VOLKSVIT-12G SG CAP 10*1*10', 'Nutritional supplement for bone health, nerve health, or immunity', 2728, ARRAY['Skin Care'], 0,
  'VOLKSVIT-12G SG CAP 10*1*10', '21069099', 0.05, 3100, 'Softgel Capsule', 'Oral',
  '10*1*10', 'STRIP', 'Omega-3 Fatty Acid, Green Tea Extract, Ginseng Extract, Ginkgo Biloba Extract, Grape Seed Extract, Ginger Extract, Garlic Extract, Guggul Extract, Green Coffee Bean Extract, Glycyrrhiza Glabra Extract, Gulab Extract, Green Chirata Extract, Giloy Extract, Multivitamin, Multimineral & Antioxidant Softgel Capsules', 'Omega-3 Fatty Acid, Green Tea Extract, Ginseng Extract, Ginkgo Biloba Extract, Grape Seed Extract, Ginger Extract, Garlic Extract, Guggul Extract, Green Coffee Bean Extract, Glycyrrhiza Glabra Extract, Gulab Extract, Green Chirata Extract, Giloy Extract, Multivitamin, Multimineral & Antioxidant Softgel Capsules', NULL,
  'Nutritional supplement for bone health, nerve health, or immunity', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('VOLKSVIT-4G SG CAP 3*10', 'Nutritional supplement for bone health, nerve health, or immunity', 460.3544, ARRAY['Skin Care'], 0,
  'VOLKSVIT-4G SG CAP 3*10', '30045090', 0.05, 523.13, 'Softgel Capsule', 'Oral',
  '3*10', 'STRIP', 'Omega-3 Fatty Acid, Green Tea Extract, Ginkgo Biloba, Ginseng Extract, Grape Seed Extract, Multivitamin, Multimineral & Antioxidant Softgel Capsules', 'Omega-3 Fatty Acid, Green Tea Extract, Ginkgo Biloba, Ginseng Extract, Grape Seed Extract, Multivitamin, Multimineral & Antioxidant Softgel Capsules', NULL,
  'Nutritional supplement for bone health, nerve health, or immunity', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('VOLKSVIT-CZS TAB 10*1*15', 'Nutritional supplement for bone health, nerve health, or immunity', 704.88, ARRAY['Nutritional Supplement'], 0,
  'VOLKSVIT-CZS TAB 10*1*15', '21069099', 0.05, 801, 'Tablet', 'Oral',
  '10*1*15', 'STRIP', 'Vitamin A 10000 I.U. + Vitamin D2 1000 I.U. + Thiamine 10 mg + Riboflavin 10 mg + Pyridoxine 3 mg + Cyanocobalamin 2.2 mcg + Nicotinamide 50 mg + Calcium Pantothenate 12.5 mg + Ascorbic Acid Coated 100 mg + Biotin 0.25 mg + Folic Acid 1 mg + Manganese Chloride 1.4 mg + Chromium Chloride 65 mcg + Zinc Oxide 15 mg + Cupric Oxide 2.2 mcg', 'Vitamin A 10000 I.U. + Vitamin D2 1000 I.U. + Thiamine 10 mg + Riboflavin 10 mg + Pyridoxine 3 mg + Cyanocobalamin 2.2 mcg + Nicotinamide 50 mg + Calcium Pantothenate 12.5 mg + Ascorbic Acid Coated 100 mg + Biotin 0.25 mg + Folic Acid 1 mg + Manganese Chloride 1.4 mg + Chromium Chloride 65 mcg + Zinc Oxide 15 mg + Cupric Oxide 2.2 mcg', NULL,
  'Nutritional supplement for bone health, nerve health, or immunity', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('VOLKSVIT-L DHA 100ML 100 ML', 'Nutritional supplement for bone health, nerve health, or immunity', 62.656000000000006, ARRAY['Nutritional Supplement'], 0,
  'VOLKSVIT-L DHA 100ML 100 ML', '21069099', 0.05, 71.2, 'Syrup', 'Oral',
  '100 ML', 'BOTTLE', 'Multivitamin, Multimineral & Antioxidant with L-Lysine, DHA & Amino Acids Syrup', 'Multivitamin, Multimineral & Antioxidant with L-Lysine, DHA & Amino Acids Syrup', NULL,
  'Nutritional supplement for bone health, nerve health, or immunity', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('VOLKSVIT-L DHA SYP 225ML 225 ML', 'Nutritional supplement for bone health, nerve health, or immunity', 132.88, ARRAY['Nutritional Supplement'], 0,
  'VOLKSVIT-L DHA SYP 225ML 225 ML', '21061000', 0.05, 151, 'Syrup', 'Oral',
  '225 ML', 'BOTTLE', 'Multivitamin, Multimineral & Antioxidant with L-Lysine, DHA & Amino Acids Syrup', 'Multivitamin, Multimineral & Antioxidant with L-Lysine, DHA & Amino Acids Syrup', NULL,
  'Nutritional supplement for bone health, nerve health, or immunity', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('VOLKSVIT-L DROPS 30 ML', 'Nutritional supplement for bone health, nerve health, or immunity', 58.74, ARRAY['Nutritional Supplement'], 0,
  'VOLKSVIT-L DROPS 30 ML', '21069099', 0.05, 66.75, 'Drops', 'Oral',
  '30 ML', 'BOTTLE', 'Multivitamin, Multimineral & Antioxidant Drops', 'Multivitamin, Multimineral & Antioxidant Drops', NULL,
  'Nutritional supplement for bone health, nerve health, or immunity', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('VOLKSVIT-L SUSP 225 ML', 'Nutritional supplement for bone health, nerve health, or immunity', 109.12, ARRAY['Nutritional Supplement'], 0,
  'VOLKSVIT-L SUSP 225 ML', '21061000', 0.05, 124, 'Suspension', 'Oral',
  '225 ML', 'BOTTLE', 'Vitamin B-Complex, Multivitamin, Multimineral & LLysine 375 mg Syrup', 'Vitamin B-Complex, Multivitamin, Multimineral & LLysine 375 mg Syrup', NULL,
  'Nutritional supplement for bone health, nerve health, or immunity', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('VOLKSVIT-LB CAP 10*10', 'Used for various medical conditions; consult a physician for specific use.', 545.6, ARRAY['Nutritional Supplement'], 0,
  'VOLKSVIT-LB CAP 10*10', '30049099', 0.05, 620, 'Capsule', 'Oral',
  '10*10', 'STRIP', 'Lactic Acid Bacillus, B-Complex with Vitamins Capsules', 'Lactic Acid Bacillus, B-Complex with Vitamins Capsules', '~130–170 g',
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('VOLKSVIT-Q10 SG CAP 10*1*10', 'Nutritional supplement for bone health, nerve health, or immunity', 4867.5, ARRAY['Skin Care'], 0,
  'VOLKSVIT-Q10 SG CAP 10*1*10', '30045090', 0.05, 5531.25, 'Softgel Capsule', 'Oral',
  '10*1*10', 'STRIP', 'Co-enzyme Q10 100 mg, L-Carnitine L-Tartrate 50 mg, Lycopene 8% 4000 mcg, Selenium Dioxide 65 mcg & Omega 3 Fatty Acid 150 mg Softgel Capsules', 'Co-enzyme Q10 100 mg, L-Carnitine L-Tartrate 50 mg, Lycopene 8% 4000 mcg, Selenium Dioxide 65 mcg & Omega 3 Fatty Acid 150 mg Softgel Capsules', NULL,
  'Nutritional supplement for bone health, nerve health, or immunity', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('VOLKSVIT-Z SYRUP 200 ML', 'Nutritional supplement for bone health, nerve health, or immunity', 101.2, ARRAY['Nutritional Supplement'], 0,
  'VOLKSVIT-Z SYRUP 200 ML', '30045090', 0.05, 115, 'Syrup', 'Oral',
  '200 ML', 'BOTTLE', 'Multivitamin & Multimineral Supplement Syrup', 'Multivitamin & Multimineral Supplement Syrup', NULL,
  'Nutritional supplement for bone health, nerve health, or immunity', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('WINDFRESH-0.31 RESPULES 4*5*2.5ML', 'Cough, Asthma, COPD, and Bronchitis', 158.4, ARRAY['Respiratory Care'], 0,
  'WINDFRESH-0.31 RESPULES 4*5*2.5ML', '30049099', 0.05, 180, 'Respules', 'Oral',
  '4*5*2.5ML', 'MINI BOTTLE', 'Levosalbutamol 0.31 mg/2.5 ml Inhalation Solution', 'Levosalbutamol 0.31 mg/2.5 ml Inhalation Solution', NULL,
  'Cough, Asthma, COPD, and Bronchitis', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('WINDFRESH-0.63 RESPULES 4*5*2.5ML', 'Cough, Asthma, COPD, and Bronchitis', 176, ARRAY['Respiratory Care'], 0,
  'WINDFRESH-0.63 RESPULES 4*5*2.5ML', '30049099', 0.05, 200, 'Respules', 'Oral',
  '4*5*2.5ML', 'MINI BOTTLE', 'Levosalbutamol 0.63 mg/2.5 ml Inhalation Solution', 'Levosalbutamol 0.63 mg/2.5 ml Inhalation Solution', NULL,
  'Cough, Asthma, COPD, and Bronchitis', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('WINDFRESH-S RESPULES 5*5*4ML', 'Used for various medical conditions; consult a physician for specific use.', 539, ARRAY['Respiratory Care'], 0,
  'WINDFRESH-S RESPULES 5*5*4ML', '30049099', 0.05, 612.5, 'Respules', 'Oral',
  '5*5*4ML', 'MINI BOTTLE', 'Sodium Chloride 3% w/v Inhalation Solution', 'Sodium Chloride 3% w/v Inhalation Solution', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('WINDPACK NASAL SPRAY 10 ML', 'Used for various medical conditions; consult a physician for specific use.', 321.2, ARRAY['Eye/Ear/Nasal Care'], 0,
  'WINDPACK NASAL SPRAY 10 ML', '30049099', 0.05, 365, 'Nasal Spray', 'topical',
  '10 ML', 'MINI BOTTLE', 'Fluticasone Propionate 0.05% w/v Nasal Spray', 'Fluticasone Propionate 0.05% w/v Nasal Spray', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('WINDPACK-3X TAB 10*10', 'Allergic conditions (sneezing, runny nose, itchy eyes), Allergic Rhinitis, and Asthma', 2156, ARRAY['Respiratory Care'], 0,
  'WINDPACK-3X TAB 10*10', '30049099', 0.05, 2450, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Acebrophylline (SR) 200 mg + Montelukast Sodium 10 mg + Desloratadine 5 mg', 'Acebrophylline (SR) 200 mg + Montelukast Sodium 10 mg + Desloratadine 5 mg', '~130–170 g',
  'Allergic conditions (sneezing, runny nose, itchy eyes), Allergic Rhinitis, and Asthma', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('WINDPACK-AZ NASAL SPRAY 10 ML', 'Used for various medical conditions; consult a physician for specific use.', 387.7544, ARRAY['Eye/Ear/Nasal Care'], 0,
  'WINDPACK-AZ NASAL SPRAY 10 ML', '30049099', 0.05, 440.63, 'Nasal Spray', 'topical',
  '10 ML', 'MINI BOTTLE', 'Fluticasone Furoate 0.02% w/v + Azelastine Hcl 0.10% w/v Nasal Spray', 'Fluticasone Furoate 0.02% w/v + Azelastine Hcl 0.10% w/v Nasal Spray', NULL,
  'Used for various medical conditions; consult a physician for specific use.', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('WINDPACK-FX TAB 10*10', 'Allergic conditions (sneezing, runny nose, itchy eyes), Allergic Rhinitis, and Asthma', 1212.7544, ARRAY['Respiratory Care'], 0,
  'WINDPACK-FX TAB 10*10', '30049099', 0.05, 1378.13, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Fexofenadine 120 mg + Montelukast 10 mg (Chewable tablets)', 'Fexofenadine 120 mg + Montelukast 10 mg (Chewable tablets)', '~130–170 g',
  'Allergic conditions (sneezing, runny nose, itchy eyes), Allergic Rhinitis, and Asthma', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('WINDPACK-L KID TAB 10*10', 'Allergic conditions (sneezing, runny nose, itchy eyes), Allergic Rhinitis, and Asthma', 618.7544, ARRAY['Respiratory Care'], 0,
  'WINDPACK-L KID TAB 10*10', '30049099', 0.05, 703.13, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Levocetirizine 2.5 mg + Montelukast 4 mg', 'Levocetirizine 2.5 mg + Montelukast 4 mg', '~130–170 g',
  'Allergic conditions (sneezing, runny nose, itchy eyes), Allergic Rhinitis, and Asthma', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('WINDPACK-L SYP 30 ML 30 ML', 'Allergic conditions (sneezing, runny nose, itchy eyes), Allergic Rhinitis, and Asthma', 52.8, ARRAY['Respiratory Care'], 0,
  'WINDPACK-L SYP 30 ML 30 ML', '30049031', 0.05, 60, 'Syrup', 'Oral',
  '30 ML', 'BOTTLE', 'Levocetirizine Hydrochloride 2.5 mg + Montelukast Sodium 4 mg/5 ml', 'Levocetirizine Hydrochloride 2.5 mg + Montelukast Sodium 4 mg/5 ml', NULL,
  'Allergic conditions (sneezing, runny nose, itchy eyes), Allergic Rhinitis, and Asthma', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('WINDPACK-L SYRUP 60 ML', 'Allergic conditions (sneezing, runny nose, itchy eyes), Allergic Rhinitis, and Asthma', 81.67280000000001, ARRAY['Respiratory Care'], 0,
  'WINDPACK-L SYRUP 60 ML', '30049061', 0.05, 92.81, 'Syrup', 'Oral',
  '60 ML', 'BOTTLE', 'Levocetirizine Hydrochloride 2.5 mg + Montelukast Sodium 4 mg/5 ml', 'Levocetirizine Hydrochloride 2.5 mg + Montelukast Sodium 4 mg/5 ml', NULL,
  'Allergic conditions (sneezing, runny nose, itchy eyes), Allergic Rhinitis, and Asthma', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('WINDPACK-L TAB 10*15', 'Allergic conditions (sneezing, runny nose, itchy eyes), Allergic Rhinitis, and Asthma', 1592.8, ARRAY['Respiratory Care'], 0,
  'WINDPACK-L TAB 10*15', '30049031', 0.05, 1810, 'Tablet', 'Oral',
  '10*15', 'STRIP', 'Levocetirizine 5 mg + Montelukast 10 mg', 'Levocetirizine 5 mg + Montelukast 10 mg', NULL,
  'Allergic conditions (sneezing, runny nose, itchy eyes), Allergic Rhinitis, and Asthma', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('WINDPACK-L TAB STRIP 10*10', 'Allergic conditions (sneezing, runny nose, itchy eyes), Allergic Rhinitis, and Asthma', 1214.4, ARRAY['Respiratory Care'], 0,
  'WINDPACK-L TAB STRIP 10*10', '300490', 0.05, 1380, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Levocetirizine 5 mg + Montelukast 10 mg', 'Levocetirizine 5 mg + Montelukast 10 mg', '~130–170 g',
  'Allergic conditions (sneezing, runny nose, itchy eyes), Allergic Rhinitis, and Asthma', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('XETAG-M1 FORTE TAB 10*10', 'Type 2 Diabetes Mellitus (Blood sugar control)', 1100, ARRAY['Cardiac / Diabetes Care'], 0,
  'XETAG-M1 FORTE TAB 10*10', '30049099', 0.05, 1250, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Glimepiride 1 mg + Metformin Hydrochloride 1000 mg (Sustained Release)', 'Glimepiride 1 mg + Metformin Hydrochloride 1000 mg (Sustained Release)', '~130–170 g',
  'Type 2 Diabetes Mellitus (Blood sugar control)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('XETAG-M1 TAB 10*15', 'Type 2 Diabetes Mellitus (Blood sugar control)', 1122, ARRAY['Cardiac / Diabetes Care'], 0,
  'XETAG-M1 TAB 10*15', '30049099', 0.05, 1275, 'Tablet', 'Oral',
  '10*15', 'STRIP', 'Glimepiride 1 mg + Metformin Hydrochloride 500 mg (Sustained Release)', 'Glimepiride 1 mg + Metformin Hydrochloride 500 mg (Sustained Release)', NULL,
  'Type 2 Diabetes Mellitus (Blood sugar control)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('XETAG-M2 FORTE TAB 10*10', 'Type 2 Diabetes Mellitus (Blood sugar control)', 1276, ARRAY['Cardiac / Diabetes Care'], 0,
  'XETAG-M2 FORTE TAB 10*10', '30049099', 0.05, 1450, 'Tablet', 'Oral',
  '10*10', 'STRIP', 'Glimepiride 2 mg + Metformin Hydrochloride 1000 mg (Prolonged Release)', 'Glimepiride 2 mg + Metformin Hydrochloride 1000 mg (Prolonged Release)', '~130–170 g',
  'Type 2 Diabetes Mellitus (Blood sugar control)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('XETAG-M2 TAB 10*15', 'Type 2 Diabetes Mellitus (Blood sugar control)', 1386, ARRAY['Cardiac / Diabetes Care'], 0,
  'XETAG-M2 TAB 10*15', '30049099', 0.05, 1575, 'Tablet', 'Oral',
  '10*15', 'STRIP', 'Glimepiride 2 mg + Metformin Hydrochloride 500 mg (Sustained Release', 'Glimepiride 2 mg + Metformin Hydrochloride 500 mg (Sustained Release', NULL,
  'Type 2 Diabetes Mellitus (Blood sugar control)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('ZENBELLY CAP 10*10', 'Gut health, Diarrhea, and restoring healthy intestinal bacteria', 1057.32, ARRAY['Eye/Ear/Nasal Care'], 0,
  'ZENBELLY CAP 10*10', '21069099', 0.05, 1201.5, 'Capsule', 'Oral',
  '10*10', 'STRIP', 'Prebiotic & Probiotic Capsules', 'Prebiotic & Probiotic Capsules', '~130–170 g',
  'Gut health, Diarrhea, and restoring healthy intestinal bacteria', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('ZENBELLY DRY POWDER 12G/60ML', 'Nutritional supplement for bone health, nerve health, or immunity', 66.572, ARRAY['Eye/Ear/Nasal Care'], 0,
  'ZENBELLY DRY POWDER 12G/60ML', '21069099', 0.05, 75.65, 'Dry powder', 'Oral',
  '12G/60ML', 'GLASS BOTTLE', 'Zinc Gluconate with Prebiotic & Probiotic Suspension', 'Zinc Gluconate with Prebiotic & Probiotic Suspension', NULL,
  'Nutritional supplement for bone health, nerve health, or immunity', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('ZENBELLY-BC SUSP 10*5 ML', 'Gut health, Diarrhea, and restoring healthy intestinal bacteria', 404.2544, ARRAY['General / Other Care'], 0,
  'ZENBELLY-BC SUSP 10*5 ML', '30029030', 0.05, 459.38, 'Suspension', 'Oral',
  '10*5 ML', 'MINI BOTTLE', 'Bacillus Clausii Spores Suspension', 'Bacillus Clausii Spores Suspension', NULL,
  'Gut health, Diarrhea, and restoring healthy intestinal bacteria', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('ZENMOOD TAB 2*5*10', 'Anxiety, Depression, and Sleep disorders', 734.2544, ARRAY['General / Other Care'], 0,
  'ZENMOOD TAB 2*5*10', '30049099', 0.05, 834.38, 'Tablet', 'Oral',
  '2*5*10', 'STRIP', 'Flupentixol 0.5 mg + Melitracen 10 mg', 'Flupentixol 0.5 mg + Melitracen 10 mg', NULL,
  'Anxiety, Depression, and Sleep disorders', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('ZIDPOWER-T INJ 1125 MG', 'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', 396, ARRAY['General / Other Care'], 0,
  'ZIDPOWER-T INJ 1125 MG', '30049099', 0.05, 450, 'Injection', 'IV',
  '1125 MG', 'VIAL', 'Ceftazidime 1000 mg + Tazobactam Sodium 125 mg', 'Ceftazidime 1000 mg + Tazobactam Sodium 125 mg', NULL,
  'Bacterial infections (Respiratory, UTI, Ear, Throat, etc.)', NULL, NULL);

INSERT INTO products (name, description, price, categories, stock,
  brand_name, hsn_code, gst_rate, mrp, product_form, consume_type,
  pack_size, pack_form, key_ingredients, strength, product_weight,
  key_benefits, direction_for_use, safety_information)
VALUES ('ZIPCEE TAB 20 TAB', 'Nutritional supplement for bone health, nerve health, or immunity', 274.12, ARRAY['Nutritional Supplement'], 0,
  'ZIPCEE TAB 20 TAB', '21069099', 0.05, 311.5, 'Tablet', 'Oral',
  '20 TAB', 'STRIP', 'Natural Vitamin C with Zinc Sulphate Monohydrate Effervescent Tablets', 'Natural Vitamin C with Zinc Sulphate Monohydrate Effervescent Tablets', NULL,
  'Nutritional supplement for bone health, nerve health, or immunity', NULL, NULL);

