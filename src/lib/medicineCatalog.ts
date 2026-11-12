import type { MedicineProduct } from '../types'

// The basic shelf a botika is expected to carry, so a pharmacy that has just
// registered is not an empty page.
//
// PRICES ARE SURVEYED, NOT INVENTED — read from Southstar Drug's own online
// catalogue (southstardrug.com.ph, 7,327 listed products) on 12 November
// 2026. Where the chain sells a thing by the piece, that is the price here;
// where it sells only a box, the box price is divided by the count printed
// on it. Generic names take the cheapest generic (Southstar Drug / RiteMed /
// Rose Pharmacy house brands); brand names take that brand.
//
// They are still ESTIMATES for any particular store. A botika in San Jose
// City is not a chain branch, prices move, and the figure below is a
// starting point nobody at that counter has confirmed. So every one of them
// arrives marked as an estimate (see priceIsEstimate on MedicineProduct),
// shown grey, and turns black the moment the pharmacy sets its own. The
// store's quotation is still what a customer pays.
//
// SURVEYED_ON is the date to re-check against; a few items Southstar does
// not list keep an unsurveyed figure and are marked below.
export const SURVEYED_ON = '2026-11-12'
export const SURVEY_SOURCE = 'Southstar Drug online catalogue'

export interface BasicMedicine {
  name: string
  genericName: string | null
  // 'rx' here is the real rule, not decoration: an Rx item makes the app ask
  // the customer for a prescription and the pharmacist to check it before
  // anything is prepared (see CREATE_MEDS_ORDER and PHARMACY_SEND_QUOTE).
  // Where the survey showed a store listing something as "Rx:", that is
  // followed even when the drug is often handed over without one.
  category: 'otc' | 'rx'
  estimatedPrice: number
  // What the price is for. Shown under the name, so "₱12" cannot be read as
  // the price of a whole bottle when it is the price of one tablet.
  unit: string
  // The shelf it sits on — gives a long pharmacy page the same category
  // tabs a restaurant menu has (see VendorStorefront's menuCategory).
  group: string
  // Set on the few items the survey could not find. Their price is a
  // plausible counter price and nothing more.
  unsurveyed?: true
}

export const BASIC_MEDICINES: BasicMedicine[] = [
  // ---- Fever & pain ----
  { name: 'Paracetamol 500mg', genericName: 'Paracetamol', category: 'otc', estimatedPrice: 5, unit: 'Per tablet', group: 'Fever & Pain' },
  { name: 'Paracetamol syrup 250mg/5ml', genericName: 'Paracetamol', category: 'otc', estimatedPrice: 99.5, unit: '60 ml bottle', group: 'Fever & Pain' },
  { name: 'Paracetamol drops 100mg/ml', genericName: 'Paracetamol', category: 'otc', estimatedPrice: 95.5, unit: '15 ml dropper bottle', group: 'Fever & Pain' },
  { name: 'Mefenamic acid 500mg', genericName: 'Mefenamic Acid', category: 'otc', estimatedPrice: 5, unit: 'Per capsule', group: 'Fever & Pain' },
  { name: 'Ibuprofen 200mg', genericName: 'Ibuprofen', category: 'otc', estimatedPrice: 9, unit: 'Per softgel', group: 'Fever & Pain' },
  { name: 'Ibuprofen + Paracetamol', genericName: 'Ibuprofen + Paracetamol', category: 'otc', estimatedPrice: 7.5, unit: 'Per tablet', group: 'Fever & Pain' },
  { name: 'Aspirin 80mg', genericName: 'Acetylsalicylic Acid', category: 'otc', estimatedPrice: 3.5, unit: 'Per tablet', group: 'Fever & Pain' },
  { name: 'Naproxen sodium 550mg', genericName: 'Naproxen Sodium', category: 'rx', estimatedPrice: 12.5, unit: 'Per tablet', group: 'Fever & Pain' },
  { name: 'Celecoxib 200mg', genericName: 'Celecoxib', category: 'rx', estimatedPrice: 22.5, unit: 'Per capsule', group: 'Fever & Pain' },
  { name: 'Etoricoxib 60mg', genericName: 'Etoricoxib', category: 'rx', estimatedPrice: 32, unit: 'Per tablet', group: 'Fever & Pain' },
  { name: 'Diclofenac 50mg', genericName: 'Diclofenac Sodium', category: 'rx', estimatedPrice: 16, unit: 'Per tablet', group: 'Fever & Pain' },
  { name: 'Tramadol + Paracetamol', genericName: 'Tramadol + Paracetamol', category: 'rx', estimatedPrice: 40, unit: 'Per tablet', group: 'Fever & Pain' },

  // ---- Cough & cold ----
  { name: 'Neozep Forte', genericName: 'Phenylephrine + Paracetamol + Chlorphenamine', category: 'otc', estimatedPrice: 8.25, unit: 'Per tablet', group: 'Cough & Cold' },
  { name: 'Bioflu', genericName: 'Paracetamol + Phenylephrine + Chlorphenamine', category: 'otc', estimatedPrice: 9.25, unit: 'Per tablet', group: 'Cough & Cold' },
  { name: 'Decolgen Forte', genericName: 'Phenylephrine + Chlorphenamine + Paracetamol', category: 'otc', estimatedPrice: 8.75, unit: 'Per tablet', group: 'Cough & Cold' },
  { name: 'Tuseran Forte', genericName: 'Dextromethorphan + Phenylpropanolamine + Paracetamol', category: 'otc', estimatedPrice: 12.5, unit: 'Per capsule', group: 'Cough & Cold' },
  { name: 'Carbocisteine 500mg', genericName: 'Carbocisteine', category: 'otc', estimatedPrice: 6.5, unit: 'Per capsule', group: 'Cough & Cold' },
  { name: 'Carbocisteine syrup 100mg/5ml', genericName: 'Carbocisteine', category: 'otc', estimatedPrice: 128.75, unit: '60 ml bottle', group: 'Cough & Cold' },
  { name: 'Ambroxol 30mg', genericName: 'Ambroxol', category: 'otc', estimatedPrice: 5.75, unit: 'Per capsule', group: 'Cough & Cold' },
  { name: 'Ambroxol syrup 15mg/5ml', genericName: 'Ambroxol', category: 'otc', estimatedPrice: 72.5, unit: '60 ml bottle', group: 'Cough & Cold' },
  { name: 'Lagundi 600mg', genericName: 'Vitex negundo', category: 'otc', estimatedPrice: 8.4, unit: 'Per tablet', group: 'Cough & Cold' },
  { name: 'Lagundi syrup', genericName: 'Vitex negundo', category: 'otc', estimatedPrice: 113.25, unit: '60 ml bottle', group: 'Cough & Cold' },
  { name: 'Guaifenesin syrup', genericName: 'Guaifenesin', category: 'otc', estimatedPrice: 128.75, unit: '60 ml bottle', group: 'Cough & Cold' },
  { name: 'Cough syrup (butamirate)', genericName: 'Butamirate Citrate', category: 'otc', estimatedPrice: 286.75, unit: '120 ml bottle', group: 'Cough & Cold' },
  { name: 'Butamirate 50mg', genericName: 'Butamirate Citrate', category: 'otc', estimatedPrice: 23.5, unit: 'Per tablet', group: 'Cough & Cold' },
  { name: 'Nasal spray', genericName: 'Nasal Decongestant Spray', category: 'otc', estimatedPrice: 91.5, unit: '30 ml spray', group: 'Cough & Cold' },
  { name: 'Vapor rub', genericName: 'Camphor + Menthol + Eucalyptus', category: 'otc', estimatedPrice: 64.25, unit: '10 g jar', group: 'Cough & Cold' },

  // ---- Allergy ----
  { name: 'Cetirizine 10mg', genericName: 'Cetirizine', category: 'otc', estimatedPrice: 10.5, unit: 'Per tablet', group: 'Allergy' },
  { name: 'Loratadine 10mg', genericName: 'Loratadine', category: 'otc', estimatedPrice: 19, unit: 'Per tablet', group: 'Allergy' },
  { name: 'Cetirizine drops', genericName: 'Cetirizine', category: 'otc', estimatedPrice: 229, unit: '10 ml dropper bottle', group: 'Allergy' },
  { name: 'Ebastine 10mg', genericName: 'Ebastine', category: 'otc', estimatedPrice: 25, unit: 'Per tablet', group: 'Allergy' },
  { name: 'Diphenhydramine 25mg', genericName: 'Diphenhydramine', category: 'otc', estimatedPrice: 12, unit: 'Per capsule', group: 'Allergy', unsurveyed: true },
  { name: 'Chlorphenamine maleate 4mg', genericName: 'Chlorphenamine Maleate', category: 'otc', estimatedPrice: 3, unit: 'Per tablet', group: 'Allergy', unsurveyed: true },
  { name: 'Montelukast 10mg', genericName: 'Montelukast', category: 'rx', estimatedPrice: 34.5, unit: 'Per tablet', group: 'Allergy' },

  // ---- Stomach ----
  { name: 'Loperamide 2mg', genericName: 'Loperamide', category: 'otc', estimatedPrice: 6, unit: 'Per capsule', group: 'Stomach' },
  { name: 'Antacid tablet', genericName: 'Famotidine + Antacid (Kremil-S Advance)', category: 'otc', estimatedPrice: 20.8, unit: 'Per tablet', group: 'Stomach' },
  { name: 'Antacid suspension', genericName: 'Aluminium + Magnesium Hydroxide + Simethicone', category: 'otc', estimatedPrice: 125, unit: '120 ml bottle', group: 'Stomach', unsurveyed: true },
  { name: 'Famotidine 20mg', genericName: 'Famotidine', category: 'otc', estimatedPrice: 10, unit: 'Per tablet', group: 'Stomach', unsurveyed: true },
  { name: 'Omeprazole 20mg', genericName: 'Omeprazole', category: 'rx', estimatedPrice: 13.75, unit: 'Per capsule', group: 'Stomach' },
  { name: 'Pantoprazole 40mg', genericName: 'Pantoprazole', category: 'rx', estimatedPrice: 16.5, unit: 'Per capsule', group: 'Stomach' },
  { name: 'Hyoscine 10mg', genericName: 'Hyoscine N-Butylbromide', category: 'otc', estimatedPrice: 35, unit: 'Per tablet', group: 'Stomach' },
  { name: 'Oral rehydration salts', genericName: 'ORS', category: 'otc', estimatedPrice: 18.75, unit: 'Per sachet', group: 'Stomach' },
  { name: 'Laxative tablet (bisacodyl)', genericName: 'Bisacodyl', category: 'otc', estimatedPrice: 30.25, unit: 'Per tablet', group: 'Stomach' },
  { name: 'Attapulgite 600mg', genericName: 'Attapulgite', category: 'otc', estimatedPrice: 12, unit: 'Per tablet', group: 'Stomach', unsurveyed: true },
  { name: 'Simethicone drops', genericName: 'Simethicone', category: 'otc', estimatedPrice: 135, unit: '15 ml dropper bottle', group: 'Stomach', unsurveyed: true },
  { name: 'Mebendazole 500mg', genericName: 'Mebendazole', category: 'otc', estimatedPrice: 30, unit: 'Per tablet', group: 'Stomach', unsurveyed: true },
  { name: 'Albendazole 400mg', genericName: 'Albendazole', category: 'otc', estimatedPrice: 45, unit: 'Per tablet', group: 'Stomach', unsurveyed: true },
  { name: 'Lactulose syrup', genericName: 'Lactulose', category: 'otc', estimatedPrice: 320, unit: '120 ml bottle', group: 'Stomach', unsurveyed: true },

  // ---- Vitamins ----
  { name: 'Vitamin C 500mg', genericName: 'Ascorbic Acid', category: 'otc', estimatedPrice: 7.5, unit: 'Per tablet', group: 'Vitamins' },
  { name: 'Vitamin C + Zinc', genericName: 'Ascorbic Acid + Zinc', category: 'otc', estimatedPrice: 7.95, unit: 'Per capsule', group: 'Vitamins' },
  { name: 'Multivitamins', genericName: 'Multivitamins', category: 'otc', estimatedPrice: 7.25, unit: 'Per tablet', group: 'Vitamins' },
  { name: 'Vitamin B complex', genericName: 'Vitamin B1 + B6 + B12', category: 'otc', estimatedPrice: 20.4, unit: 'Per tablet', group: 'Vitamins' },
  { name: 'Ferrous sulfate + folic acid', genericName: 'Ferrous Sulfate + Folic Acid', category: 'otc', estimatedPrice: 4, unit: 'Per tablet', group: 'Vitamins' },
  { name: 'Zinc 20mg', genericName: 'Zinc Sulfate', category: 'otc', estimatedPrice: 6.5, unit: 'Per tablet', group: 'Vitamins' },
  { name: 'Calcium + Vitamin D', genericName: 'Calcium Carbonate + Cholecalciferol', category: 'otc', estimatedPrice: 8.58, unit: 'Per tablet', group: 'Vitamins' },
  { name: 'Vitamin E 400 IU', genericName: 'Tocopherol', category: 'otc', estimatedPrice: 8.25, unit: 'Per softgel', group: 'Vitamins' },
  { name: 'Fish oil 1000mg', genericName: 'Omega-3 Fatty Acids', category: 'otc', estimatedPrice: 9, unit: 'Per softgel', group: 'Vitamins' },
  { name: 'Folic acid 5mg', genericName: 'Folic Acid', category: 'otc', estimatedPrice: 3, unit: 'Per tablet', group: 'Vitamins', unsurveyed: true },
  { name: 'Prenatal multivitamins', genericName: 'Multivitamins + Minerals', category: 'otc', estimatedPrice: 20, unit: 'Per tablet', group: 'Vitamins', unsurveyed: true },
  { name: 'Vitamin syrup for children', genericName: 'Multivitamins + Lysine', category: 'otc', estimatedPrice: 92.25, unit: '60 ml bottle', group: 'Vitamins' },

  // ---- First aid ----
  { name: 'Povidone-iodine 10%', genericName: 'Povidone-Iodine', category: 'otc', estimatedPrice: 102.25, unit: '25 ml bottle', group: 'First Aid' },
  { name: 'Rubbing alcohol 70%', genericName: 'Ethyl Alcohol', category: 'otc', estimatedPrice: 39, unit: '150 ml bottle', group: 'First Aid' },
  { name: 'Hydrogen peroxide 3%', genericName: 'Hydrogen Peroxide', category: 'otc', estimatedPrice: 31, unit: '120 ml bottle', group: 'First Aid' },
  { name: 'Sterile gauze pad', genericName: null, category: 'otc', estimatedPrice: 6, unit: 'Per piece', group: 'First Aid' },
  { name: 'Elastic bandage 2 inch', genericName: null, category: 'otc', estimatedPrice: 38, unit: 'Per roll', group: 'First Aid' },
  { name: 'Alcohol swab', genericName: null, category: 'otc', estimatedPrice: 1, unit: 'Per piece', group: 'First Aid' },
  { name: 'Cotton balls', genericName: null, category: 'otc', estimatedPrice: 22, unit: 'Pack of 50', group: 'First Aid' },
  { name: 'Face mask (surgical)', genericName: null, category: 'otc', estimatedPrice: 9, unit: 'Per piece', group: 'First Aid' },
  { name: 'Liniment oil', genericName: 'Methyl Salicylate + Menthol', category: 'otc', estimatedPrice: 38.5, unit: '25 ml bottle', group: 'First Aid' },
  { name: 'Adhesive bandage', genericName: null, category: 'otc', estimatedPrice: 5, unit: 'Per piece', group: 'First Aid', unsurveyed: true },
  { name: 'Micropore tape 1 inch', genericName: null, category: 'otc', estimatedPrice: 45, unit: 'Per roll', group: 'First Aid', unsurveyed: true },
  { name: 'Burn ointment', genericName: 'Silver Sulfadiazine', category: 'rx', estimatedPrice: 250, unit: '25 g tube', group: 'First Aid', unsurveyed: true },

  // ---- Skin ----
  { name: 'Mupirocin ointment', genericName: 'Mupirocin', category: 'rx', estimatedPrice: 247.75, unit: '5 g tube', group: 'Skin' },
  { name: 'Hydrocortisone cream 1%', genericName: 'Hydrocortisone', category: 'rx', estimatedPrice: 193.5, unit: '10 g tube', group: 'Skin' },
  { name: 'Clotrimazole cream', genericName: 'Clotrimazole', category: 'otc', estimatedPrice: 90.75, unit: '3 g tube', group: 'Skin' },
  { name: 'Ketoconazole cream', genericName: 'Ketoconazole', category: 'otc', estimatedPrice: 155, unit: '15 g tube', group: 'Skin', unsurveyed: true },
  { name: 'Calamine lotion', genericName: 'Calamine', category: 'otc', estimatedPrice: 65, unit: '30 ml bottle', group: 'Skin', unsurveyed: true },
  { name: 'Diclofenac gel', genericName: 'Diclofenac Sodium', category: 'otc', estimatedPrice: 180, unit: '20 g tube', group: 'Skin', unsurveyed: true },

  // ---- Eye & ear ----
  { name: 'Lubricating eye drops', genericName: 'Carboxymethylcellulose', category: 'otc', estimatedPrice: 281.5, unit: '5 ml bottle', group: 'Eye & Ear' },
  { name: 'Ear drops', genericName: 'Ear Wax Softener', category: 'rx', estimatedPrice: 352, unit: '10 ml bottle', group: 'Eye & Ear' },
  { name: 'Antibiotic eye drops', genericName: 'Chloramphenicol', category: 'rx', estimatedPrice: 165, unit: '5 ml bottle', group: 'Eye & Ear', unsurveyed: true },

  // ---- Supplies ----
  { name: 'Digital thermometer', genericName: null, category: 'otc', estimatedPrice: 140.75, unit: 'Per piece', group: 'Supplies' },
  { name: 'Pregnancy test kit', genericName: null, category: 'otc', estimatedPrice: 72, unit: 'Per piece', group: 'Supplies' },
  { name: 'Blood glucose test strip', genericName: null, category: 'otc', estimatedPrice: 44.1, unit: 'Per strip', group: 'Supplies' },
  { name: 'Insulin syringe', genericName: null, category: 'otc', estimatedPrice: 16.25, unit: 'Per piece', group: 'Supplies' },
  { name: 'Syringe 3cc', genericName: null, category: 'otc', estimatedPrice: 12, unit: 'Per piece', group: 'Supplies', unsurveyed: true },

  // ---- Antibiotics — prescription only ----
  { name: 'Amoxicillin 500mg', genericName: 'Amoxicillin', category: 'rx', estimatedPrice: 7.5, unit: 'Per capsule', group: 'Antibiotics' },
  { name: 'Cloxacillin 500mg', genericName: 'Cloxacillin', category: 'rx', estimatedPrice: 17, unit: 'Per capsule', group: 'Antibiotics' },
  { name: 'Co-amoxiclav 625mg', genericName: 'Amoxicillin + Clavulanic Acid', category: 'rx', estimatedPrice: 59, unit: 'Per tablet', group: 'Antibiotics' },
  { name: 'Cefuroxime 500mg', genericName: 'Cefuroxime', category: 'rx', estimatedPrice: 43.75, unit: 'Per tablet', group: 'Antibiotics' },
  { name: 'Cefixime 200mg', genericName: 'Cefixime', category: 'rx', estimatedPrice: 90, unit: 'Per capsule', group: 'Antibiotics' },
  { name: 'Azithromycin 500mg', genericName: 'Azithromycin', category: 'rx', estimatedPrice: 60, unit: 'Per tablet', group: 'Antibiotics' },
  { name: 'Clarithromycin 500mg', genericName: 'Clarithromycin', category: 'rx', estimatedPrice: 35.75, unit: 'Per tablet', group: 'Antibiotics' },
  { name: 'Ciprofloxacin 500mg', genericName: 'Ciprofloxacin', category: 'rx', estimatedPrice: 19.5, unit: 'Per tablet', group: 'Antibiotics' },
  { name: 'Doxycycline 100mg', genericName: 'Doxycycline', category: 'rx', estimatedPrice: 45, unit: 'Per capsule', group: 'Antibiotics' },
  { name: 'Metronidazole 500mg', genericName: 'Metronidazole', category: 'rx', estimatedPrice: 14, unit: 'Per tablet', group: 'Antibiotics' },
  { name: 'Clindamycin 300mg', genericName: 'Clindamycin', category: 'rx', estimatedPrice: 24.75, unit: 'Per capsule', group: 'Antibiotics' },
  { name: 'Cefalexin 500mg', genericName: 'Cefalexin', category: 'rx', estimatedPrice: 18, unit: 'Per capsule', group: 'Antibiotics', unsurveyed: true },
  { name: 'Cotrimoxazole 800mg/160mg', genericName: 'Sulfamethoxazole + Trimethoprim', category: 'rx', estimatedPrice: 12, unit: 'Per tablet', group: 'Antibiotics', unsurveyed: true },
  { name: 'Amoxicillin drops', genericName: 'Amoxicillin', category: 'rx', estimatedPrice: 210, unit: '15 ml dropper bottle', group: 'Antibiotics', unsurveyed: true },

  // ---- Maintenance — prescription only. The shelf a provincial botika
  // actually turns over: blood pressure, sugar, cholesterol, gout, asthma.
  { name: 'Metformin 500mg', genericName: 'Metformin', category: 'rx', estimatedPrice: 3.75, unit: 'Per tablet', group: 'Maintenance' },
  { name: 'Gliclazide 30mg', genericName: 'Gliclazide', category: 'rx', estimatedPrice: 7, unit: 'Per tablet', group: 'Maintenance' },
  { name: 'Glimepiride 2mg', genericName: 'Glimepiride', category: 'rx', estimatedPrice: 11.75, unit: 'Per tablet', group: 'Maintenance' },
  { name: 'Sitagliptin 50mg', genericName: 'Sitagliptin', category: 'rx', estimatedPrice: 21.75, unit: 'Per tablet', group: 'Maintenance' },
  { name: 'Losartan 50mg', genericName: 'Losartan Potassium', category: 'rx', estimatedPrice: 8, unit: 'Per tablet', group: 'Maintenance' },
  { name: 'Amlodipine 5mg', genericName: 'Amlodipine', category: 'rx', estimatedPrice: 5.75, unit: 'Per tablet', group: 'Maintenance' },
  { name: 'Amlodipine 10mg', genericName: 'Amlodipine', category: 'rx', estimatedPrice: 9.25, unit: 'Per tablet', group: 'Maintenance' },
  { name: 'Telmisartan 40mg', genericName: 'Telmisartan', category: 'rx', estimatedPrice: 12.75, unit: 'Per tablet', group: 'Maintenance' },
  { name: 'Valsartan 80mg', genericName: 'Valsartan', category: 'rx', estimatedPrice: 18.5, unit: 'Per tablet', group: 'Maintenance' },
  { name: 'Irbesartan 150mg', genericName: 'Irbesartan', category: 'rx', estimatedPrice: 11.65, unit: 'Per tablet', group: 'Maintenance' },
  { name: 'Metoprolol 50mg', genericName: 'Metoprolol', category: 'rx', estimatedPrice: 2.5, unit: 'Per tablet', group: 'Maintenance' },
  { name: 'Carvedilol 25mg', genericName: 'Carvedilol', category: 'rx', estimatedPrice: 8, unit: 'Per tablet', group: 'Maintenance' },
  { name: 'Atenolol 50mg', genericName: 'Atenolol', category: 'rx', estimatedPrice: 6.5, unit: 'Per tablet', group: 'Maintenance' },
  { name: 'Captopril 25mg', genericName: 'Captopril', category: 'rx', estimatedPrice: 11, unit: 'Per tablet', group: 'Maintenance' },
  { name: 'Furosemide 40mg', genericName: 'Furosemide', category: 'rx', estimatedPrice: 7.6, unit: 'Per tablet', group: 'Maintenance' },
  { name: 'Atorvastatin 20mg', genericName: 'Atorvastatin', category: 'rx', estimatedPrice: 15, unit: 'Per tablet', group: 'Maintenance' },
  { name: 'Simvastatin 20mg', genericName: 'Simvastatin', category: 'rx', estimatedPrice: 9.5, unit: 'Per tablet', group: 'Maintenance' },
  { name: 'Rosuvastatin 10mg', genericName: 'Rosuvastatin', category: 'rx', estimatedPrice: 15.25, unit: 'Per tablet', group: 'Maintenance' },
  { name: 'Fenofibrate 200mg', genericName: 'Fenofibrate', category: 'rx', estimatedPrice: 22, unit: 'Per capsule', group: 'Maintenance' },
  { name: 'Clopidogrel 75mg', genericName: 'Clopidogrel', category: 'rx', estimatedPrice: 20.75, unit: 'Per tablet', group: 'Maintenance' },
  { name: 'Colchicine 500mcg', genericName: 'Colchicine', category: 'rx', estimatedPrice: 4.6, unit: 'Per tablet', group: 'Maintenance' },
  { name: 'Betahistine 16mg', genericName: 'Betahistine', category: 'rx', estimatedPrice: 21.5, unit: 'Per tablet', group: 'Maintenance' },
  { name: 'Gabapentin 300mg', genericName: 'Gabapentin', category: 'rx', estimatedPrice: 32, unit: 'Per capsule', group: 'Maintenance' },
  { name: 'Pregabalin 75mg', genericName: 'Pregabalin', category: 'rx', estimatedPrice: 41, unit: 'Per capsule', group: 'Maintenance' },
  { name: 'Salbutamol nebule 2.5mg', genericName: 'Salbutamol', category: 'rx', estimatedPrice: 47, unit: 'Per nebule', group: 'Maintenance' },
  { name: 'Allopurinol 300mg', genericName: 'Allopurinol', category: 'rx', estimatedPrice: 12, unit: 'Per tablet', group: 'Maintenance', unsurveyed: true },
  { name: 'Levothyroxine 50mcg', genericName: 'Levothyroxine', category: 'rx', estimatedPrice: 12, unit: 'Per tablet', group: 'Maintenance', unsurveyed: true },
  { name: 'Prednisone 20mg', genericName: 'Prednisone', category: 'rx', estimatedPrice: 12, unit: 'Per tablet', group: 'Maintenance', unsurveyed: true },
  { name: 'Citicoline 500mg', genericName: 'Citicoline', category: 'rx', estimatedPrice: 25, unit: 'Per tablet', group: 'Maintenance', unsurveyed: true },
  { name: 'Salbutamol inhaler', genericName: 'Salbutamol', category: 'rx', estimatedPrice: 480, unit: 'Per inhaler', group: 'Maintenance', unsurveyed: true },

  // ---- Baby & milk — not medicine, and the reason half the people who walk
  // into a botika walk into one. Formula and diapers at 2am is exactly the
  // errand this app exists to save somebody.
  { name: 'Infant formula milk (0-6 months)', genericName: null, category: 'otc', estimatedPrice: 828, unit: '400 g box', group: 'Baby & Milk' },
  { name: 'Follow-on formula milk (6-12 months)', genericName: null, category: 'otc', estimatedPrice: 828, unit: '400 g box', group: 'Baby & Milk' },
  { name: 'Growing-up milk (1-3 years)', genericName: null, category: 'otc', estimatedPrice: 284, unit: '350 g box', group: 'Baby & Milk' },
  { name: 'Pre-school milk (3 years and up)', genericName: null, category: 'otc', estimatedPrice: 253, unit: '350 g box', group: 'Baby & Milk' },
  { name: 'Powdered milk (adult)', genericName: null, category: 'otc', estimatedPrice: 221, unit: '340 g pack', group: 'Baby & Milk' },
  { name: 'Diapers — newborn', genericName: null, category: 'otc', estimatedPrice: 8.76, unit: 'Per piece', group: 'Baby & Milk' },
  { name: 'Diapers — small', genericName: null, category: 'otc', estimatedPrice: 8.95, unit: 'Per piece', group: 'Baby & Milk' },
  { name: 'Diapers — medium', genericName: null, category: 'otc', estimatedPrice: 8.15, unit: 'Per piece', group: 'Baby & Milk' },
  { name: 'Diapers — large', genericName: null, category: 'otc', estimatedPrice: 9.07, unit: 'Per piece', group: 'Baby & Milk' },
  { name: 'Diapers — pack of 30', genericName: null, category: 'otc', estimatedPrice: 262.75, unit: 'Per pack', group: 'Baby & Milk' },
  { name: 'Baby wipes', genericName: null, category: 'otc', estimatedPrice: 99, unit: 'Pack of 90', group: 'Baby & Milk' },
  { name: 'Baby powder', genericName: null, category: 'otc', estimatedPrice: 70, unit: '100 g bottle', group: 'Baby & Milk' },
  { name: 'Baby oil', genericName: null, category: 'otc', estimatedPrice: 56.5, unit: '50 ml bottle', group: 'Baby & Milk' },
  { name: 'Feeding bottle', genericName: null, category: 'otc', estimatedPrice: 82.5, unit: 'Per piece', group: 'Baby & Milk' },
  { name: 'Petroleum jelly', genericName: null, category: 'otc', estimatedPrice: 69, unit: '50 ml jar', group: 'Baby & Milk' },
  { name: 'Baby bath soap', genericName: null, category: 'otc', estimatedPrice: 95, unit: 'Per bottle', group: 'Baby & Milk', unsurveyed: true },
  { name: 'Feeding bottle nipple', genericName: null, category: 'otc', estimatedPrice: 60, unit: 'Per piece', group: 'Baby & Milk', unsurveyed: true },

  // ---- Personal care — the rest of the counter ----
  { name: 'Sanitary napkins', genericName: null, category: 'otc', estimatedPrice: 45, unit: 'Pack of 8', group: 'Personal Care' },
  { name: 'Panty liners', genericName: null, category: 'otc', estimatedPrice: 24, unit: 'Pack of 20', group: 'Personal Care' },
  { name: 'Adult diapers', genericName: null, category: 'otc', estimatedPrice: 24.7, unit: 'Per piece', group: 'Personal Care' },
  { name: 'Cotton buds', genericName: null, category: 'otc', estimatedPrice: 16.5, unit: 'Per pack', group: 'Personal Care' },
  { name: 'Hand sanitizer', genericName: 'Ethyl Alcohol Gel', category: 'otc', estimatedPrice: 69, unit: '50 ml bottle', group: 'Personal Care' },
  { name: 'Toothpaste', genericName: null, category: 'otc', estimatedPrice: 51, unit: '40 g tube', group: 'Personal Care' },
  { name: 'Shampoo sachet', genericName: null, category: 'otc', estimatedPrice: 6.5, unit: 'Per sachet', group: 'Personal Care' },
  { name: 'Bath soap', genericName: null, category: 'otc', estimatedPrice: 55, unit: 'Per bar', group: 'Personal Care', unsurveyed: true },
]

// Two names are the same medicine for this purpose if they read the same
// once case and spacing stop mattering. Loose on purpose: the cost of a
// false match is one item the pharmacy has to add by hand, the cost of a
// miss is a duplicate line on their own shelf.
function key(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ')
}

// Whether an entry is sold by the piece. The generic name alone cannot tell
// a paracetamol tablet from a bottle of paracetamol syrup, and a store
// carrying Biogesic was having the syrup skipped as "already stocked" — so
// only piece-priced entries are matched by what they are made of. A bottle,
// tube or inhaler has to match by name before it counts as the same thing.
function soldByThePiece(unit: string): boolean {
  return /^per /i.test(unit.trim())
}

export function basicMedicineId(pharmacyId: string, name: string): string {
  return `med-basic-${pharmacyId}-${key(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
}

// What this pharmacy is missing from the basic list. An item already on
// their shelf is never duplicated — matched by its own name or by what it
// is made of, so a store carrying "Biogesic 500mg" does not also get
// "Paracetamol 500mg".
export function missingBasicMedicines(existing: MedicineProduct[]): BasicMedicine[] {
  const taken = new Set<string>()
  for (const p of existing) {
    taken.add(key(p.name))
    if (p.genericName) taken.add(key(p.genericName))
  }
  return BASIC_MEDICINES.filter(
    (m) =>
      !taken.has(key(m.name)) &&
      !(soldByThePiece(m.unit) && m.genericName && taken.has(key(m.genericName))),
  )
}

// The missing basics as real products for this pharmacy, priced as
// estimates. `existing` is that pharmacy's own items only — pass the whole
// catalogue and every store would be judged by every other store's shelf.
export function basicMedicineProducts(pharmacyId: string, existing: MedicineProduct[] = []): MedicineProduct[] {
  return missingBasicMedicines(existing).map((m) => ({
    id: basicMedicineId(pharmacyId, m.name),
    pharmacyId,
    name: m.name,
    genericName: m.genericName,
    category: m.category,
    price: m.estimatedPrice,
    priceIsEstimate: true,
    inStock: true,
    menuCategory: m.group,
    description: m.unit,
    // No photoDataUrl/badge/stockCount: every one of these is optional and
    // would be null, and this list multiplies by every pharmacy in the
    // system — three null fields each is a few hundred kilobytes of nothing
    // in a state that is saved whole on every change.
  }))
}

// Grey or black, in one place so the portal and the customer's page can
// never disagree about which price is whose.
export function isEstimatedPrice(product: Pick<MedicineProduct, 'priceIsEstimate'>): boolean {
  return product.priceIsEstimate === true
}

// Surveyed prices are not whole pesos — a tablet at ₱3.50 has to read as
// ₱3.50 and not ₱3.5, while ₱110 should not read as ₱110.00.
export function formatPeso(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2)
}
