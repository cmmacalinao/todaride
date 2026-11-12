import type { MedicineProduct } from '../types'

// The basic medicines a botika is expected to carry, so a pharmacy that has
// just registered is not an empty shelf. Every price here is an ESTIMATE —
// a plausible counter price, not this store's price — and arrives marked as
// one (see priceIsEstimate on MedicineProduct). The store prices what it
// actually sells and the grey turns black; nothing here pretends to be a
// quotation, and the pharmacy's quote is still what a customer pays.
//
// Deliberately no 'restricted' items: a starter list should not put
// Tramadol or Diazepam on a counter nobody has asked for. A pharmacy that
// carries them adds them itself, with its own price, as it always could.
export interface BasicMedicine {
  name: string
  genericName: string | null
  // 'rx' here is the real rule, not decoration: an Rx item makes the app ask
  // the customer for a prescription and the pharmacist to check it before
  // anything is prepared (see CREATE_MEDS_ORDER and PHARMACY_SEND_QUOTE).
  category: 'otc' | 'rx'
  estimatedPrice: number
  // What the price is for. Shown under the name, so "₱12" cannot be read as
  // the price of a whole bottle when it is the price of one tablet.
  unit: string
  // The shelf it sits on — gives a 40-item pharmacy page the same category
  // tabs a restaurant menu has (see VendorStorefront's menuCategory).
  group: string
}

export const BASIC_MEDICINES: BasicMedicine[] = [
  // Fever & pain
  { name: 'Paracetamol 500mg', genericName: 'Paracetamol', category: 'otc', estimatedPrice: 5, unit: 'Per tablet', group: 'Fever & Pain' },
  { name: 'Paracetamol syrup 250mg/5ml', genericName: 'Paracetamol', category: 'otc', estimatedPrice: 130, unit: '60 ml bottle', group: 'Fever & Pain' },
  { name: 'Mefenamic acid 500mg', genericName: 'Mefenamic Acid', category: 'otc', estimatedPrice: 16, unit: 'Per capsule', group: 'Fever & Pain' },
  { name: 'Ibuprofen 200mg', genericName: 'Ibuprofen', category: 'otc', estimatedPrice: 12, unit: 'Per tablet', group: 'Fever & Pain' },
  { name: 'Ibuprofen + Paracetamol', genericName: 'Ibuprofen + Paracetamol', category: 'otc', estimatedPrice: 11, unit: 'Per tablet', group: 'Fever & Pain' },
  { name: 'Aspirin 80mg', genericName: 'Acetylsalicylic Acid', category: 'otc', estimatedPrice: 3, unit: 'Per tablet', group: 'Fever & Pain' },
  { name: 'Naproxen sodium 550mg', genericName: 'Naproxen Sodium', category: 'otc', estimatedPrice: 22, unit: 'Per tablet', group: 'Fever & Pain' },
  { name: 'Paracetamol drops 100mg/ml', genericName: 'Paracetamol', category: 'otc', estimatedPrice: 115, unit: '15 ml dropper bottle', group: 'Fever & Pain' },
  { name: 'Celecoxib 200mg', genericName: 'Celecoxib', category: 'rx', estimatedPrice: 35, unit: 'Per capsule', group: 'Fever & Pain' },
  { name: 'Tramadol + Paracetamol', genericName: 'Tramadol + Paracetamol', category: 'rx', estimatedPrice: 30, unit: 'Per tablet', group: 'Fever & Pain' },

  // Cough & cold
  { name: 'Neozep Forte', genericName: 'Phenylephrine + Paracetamol + Chlorphenamine', category: 'otc', estimatedPrice: 8, unit: 'Per tablet', group: 'Cough & Cold' },
  { name: 'Bioflu', genericName: 'Paracetamol + Phenylephrine + Chlorphenamine', category: 'otc', estimatedPrice: 9, unit: 'Per tablet', group: 'Cough & Cold' },
  { name: 'Carbocisteine 500mg', genericName: 'Carbocisteine', category: 'otc', estimatedPrice: 15, unit: 'Per capsule', group: 'Cough & Cold' },
  { name: 'Ambroxol 30mg', genericName: 'Ambroxol', category: 'otc', estimatedPrice: 10, unit: 'Per tablet', group: 'Cough & Cold' },
  { name: 'Lagundi 600mg', genericName: 'Vitex negundo', category: 'otc', estimatedPrice: 12, unit: 'Per tablet', group: 'Cough & Cold' },
  { name: 'Cough syrup (butamirate)', genericName: 'Butamirate Citrate', category: 'otc', estimatedPrice: 185, unit: '60 ml bottle', group: 'Cough & Cold' },
  { name: 'Decolgen Forte', genericName: 'Phenylephrine + Chlorphenamine + Paracetamol', category: 'otc', estimatedPrice: 8, unit: 'Per tablet', group: 'Cough & Cold' },
  { name: 'Tuseran Forte', genericName: 'Dextromethorphan + Phenylpropanolamine + Paracetamol', category: 'otc', estimatedPrice: 13, unit: 'Per capsule', group: 'Cough & Cold' },
  { name: 'Carbocisteine syrup 100mg/5ml', genericName: 'Carbocisteine', category: 'otc', estimatedPrice: 150, unit: '60 ml bottle', group: 'Cough & Cold' },
  { name: 'Ambroxol syrup 15mg/5ml', genericName: 'Ambroxol', category: 'otc', estimatedPrice: 150, unit: '60 ml bottle', group: 'Cough & Cold' },
  { name: 'Lagundi syrup', genericName: 'Vitex negundo', category: 'otc', estimatedPrice: 140, unit: '60 ml bottle', group: 'Cough & Cold' },
  { name: 'Guaifenesin syrup', genericName: 'Guaifenesin', category: 'otc', estimatedPrice: 155, unit: '60 ml bottle', group: 'Cough & Cold' },
  { name: 'Nasal spray (oxymetazoline)', genericName: 'Oxymetazoline', category: 'otc', estimatedPrice: 230, unit: '15 ml spray', group: 'Cough & Cold' },
  { name: 'Vapor rub', genericName: 'Camphor + Menthol + Eucalyptus', category: 'otc', estimatedPrice: 85, unit: '10 g jar', group: 'Cough & Cold' },

  // Allergy
  { name: 'Cetirizine 10mg', genericName: 'Cetirizine', category: 'otc', estimatedPrice: 10, unit: 'Per tablet', group: 'Allergy' },
  { name: 'Loratadine 10mg', genericName: 'Loratadine', category: 'otc', estimatedPrice: 12, unit: 'Per tablet', group: 'Allergy' },
  { name: 'Diphenhydramine 25mg', genericName: 'Diphenhydramine', category: 'otc', estimatedPrice: 12, unit: 'Per capsule', group: 'Allergy' },
  { name: 'Chlorphenamine maleate 4mg', genericName: 'Chlorphenamine Maleate', category: 'otc', estimatedPrice: 3, unit: 'Per tablet', group: 'Allergy' },
  { name: 'Cetirizine drops', genericName: 'Cetirizine', category: 'otc', estimatedPrice: 190, unit: '15 ml dropper bottle', group: 'Allergy' },
  { name: 'Montelukast 10mg', genericName: 'Montelukast', category: 'rx', estimatedPrice: 35, unit: 'Per tablet', group: 'Allergy' },

  // Stomach
  { name: 'Loperamide 2mg', genericName: 'Loperamide', category: 'otc', estimatedPrice: 15, unit: 'Per capsule', group: 'Stomach' },
  { name: 'Antacid tablet', genericName: 'Aluminium + Magnesium Hydroxide', category: 'otc', estimatedPrice: 8, unit: 'Per tablet', group: 'Stomach' },
  { name: 'Omeprazole 20mg', genericName: 'Omeprazole', category: 'otc', estimatedPrice: 12, unit: 'Per capsule', group: 'Stomach' },
  { name: 'Hyoscine 10mg', genericName: 'Hyoscine N-Butylbromide', category: 'otc', estimatedPrice: 25, unit: 'Per tablet', group: 'Stomach' },
  { name: 'Oral rehydration salts', genericName: 'ORS', category: 'otc', estimatedPrice: 20, unit: 'Per sachet', group: 'Stomach' },
  { name: 'Bisacodyl 5mg', genericName: 'Bisacodyl', category: 'otc', estimatedPrice: 12, unit: 'Per tablet', group: 'Stomach' },
  { name: 'Famotidine 20mg', genericName: 'Famotidine', category: 'otc', estimatedPrice: 10, unit: 'Per tablet', group: 'Stomach' },
  { name: 'Attapulgite 600mg', genericName: 'Attapulgite', category: 'otc', estimatedPrice: 12, unit: 'Per tablet', group: 'Stomach' },
  { name: 'Antacid suspension', genericName: 'Aluminium + Magnesium Hydroxide + Simethicone', category: 'otc', estimatedPrice: 125, unit: '120 ml bottle', group: 'Stomach' },
  { name: 'Simethicone drops', genericName: 'Simethicone', category: 'otc', estimatedPrice: 135, unit: '15 ml dropper bottle', group: 'Stomach' },
  { name: 'Mebendazole 500mg', genericName: 'Mebendazole', category: 'otc', estimatedPrice: 30, unit: 'Per tablet', group: 'Stomach' },
  { name: 'Albendazole 400mg', genericName: 'Albendazole', category: 'otc', estimatedPrice: 45, unit: 'Per tablet', group: 'Stomach' },
  { name: 'Lactulose syrup', genericName: 'Lactulose', category: 'otc', estimatedPrice: 320, unit: '120 ml bottle', group: 'Stomach' },

  // Vitamins
  { name: 'Vitamin C 500mg', genericName: 'Ascorbic Acid', category: 'otc', estimatedPrice: 8, unit: 'Per capsule', group: 'Vitamins' },
  { name: 'Vitamin C + Zinc', genericName: 'Ascorbic Acid + Zinc', category: 'otc', estimatedPrice: 9, unit: 'Per capsule', group: 'Vitamins' },
  { name: 'Multivitamins', genericName: 'Multivitamins', category: 'otc', estimatedPrice: 10, unit: 'Per tablet', group: 'Vitamins' },
  { name: 'Vitamin B complex', genericName: 'Vitamin B1 + B6 + B12', category: 'otc', estimatedPrice: 18, unit: 'Per tablet', group: 'Vitamins' },
  { name: 'Ferrous sulfate + folic acid', genericName: 'Ferrous Sulfate + Folic Acid', category: 'otc', estimatedPrice: 5, unit: 'Per capsule', group: 'Vitamins' },
  { name: 'Zinc 20mg', genericName: 'Zinc Sulfate', category: 'otc', estimatedPrice: 8, unit: 'Per tablet', group: 'Vitamins' },
  { name: 'Calcium + Vitamin D', genericName: 'Calcium Carbonate + Cholecalciferol', category: 'otc', estimatedPrice: 12, unit: 'Per tablet', group: 'Vitamins' },
  { name: 'Vitamin E 400 IU', genericName: 'Tocopherol', category: 'otc', estimatedPrice: 15, unit: 'Per softgel', group: 'Vitamins' },
  { name: 'Folic acid 5mg', genericName: 'Folic Acid', category: 'otc', estimatedPrice: 3, unit: 'Per tablet', group: 'Vitamins' },
  { name: 'Fish oil 1000mg', genericName: 'Omega-3 Fatty Acids', category: 'otc', estimatedPrice: 12, unit: 'Per softgel', group: 'Vitamins' },
  { name: 'Prenatal multivitamins', genericName: 'Multivitamins + Minerals', category: 'otc', estimatedPrice: 20, unit: 'Per tablet', group: 'Vitamins' },
  { name: 'Vitamin syrup for children', genericName: 'Multivitamins', category: 'otc', estimatedPrice: 165, unit: '120 ml bottle', group: 'Vitamins' },

  // First aid
  { name: 'Povidone-iodine 10%', genericName: 'Povidone-Iodine', category: 'otc', estimatedPrice: 130, unit: '60 ml bottle', group: 'First Aid' },
  { name: 'Rubbing alcohol 70%', genericName: 'Isopropyl Alcohol', category: 'otc', estimatedPrice: 45, unit: '250 ml bottle', group: 'First Aid' },
  { name: 'Hydrogen peroxide 3%', genericName: 'Hydrogen Peroxide', category: 'otc', estimatedPrice: 35, unit: '120 ml bottle', group: 'First Aid' },
  { name: 'Adhesive bandage', genericName: null, category: 'otc', estimatedPrice: 5, unit: 'Per piece', group: 'First Aid' },
  { name: 'Sterile gauze pad', genericName: null, category: 'otc', estimatedPrice: 10, unit: 'Per piece', group: 'First Aid' },
  { name: 'Liniment oil', genericName: 'Methyl Salicylate + Menthol', category: 'otc', estimatedPrice: 75, unit: '50 ml bottle', group: 'First Aid' },
  { name: 'Face mask (surgical)', genericName: null, category: 'otc', estimatedPrice: 3, unit: 'Per piece', group: 'First Aid' },
  { name: 'Cotton balls', genericName: null, category: 'otc', estimatedPrice: 35, unit: 'Per pack', group: 'First Aid' },
  { name: 'Micropore tape 1 inch', genericName: null, category: 'otc', estimatedPrice: 45, unit: 'Per roll', group: 'First Aid' },
  { name: 'Elastic bandage 2 inch', genericName: null, category: 'otc', estimatedPrice: 85, unit: 'Per roll', group: 'First Aid' },
  { name: 'Alcohol swab', genericName: null, category: 'otc', estimatedPrice: 2, unit: 'Per piece', group: 'First Aid' },
  { name: 'Burn ointment', genericName: 'Silver Sulfadiazine', category: 'rx', estimatedPrice: 250, unit: '25 g tube', group: 'First Aid' },
  { name: 'Mupirocin ointment', genericName: 'Mupirocin', category: 'otc', estimatedPrice: 185, unit: '5 g tube', group: 'Skin' },
  { name: 'Hydrocortisone cream 1%', genericName: 'Hydrocortisone', category: 'otc', estimatedPrice: 120, unit: '5 g tube', group: 'Skin' },
  { name: 'Clotrimazole cream', genericName: 'Clotrimazole', category: 'otc', estimatedPrice: 120, unit: '10 g tube', group: 'Skin' },
  { name: 'Ketoconazole cream', genericName: 'Ketoconazole', category: 'otc', estimatedPrice: 155, unit: '15 g tube', group: 'Skin' },
  { name: 'Calamine lotion', genericName: 'Calamine', category: 'otc', estimatedPrice: 65, unit: '30 ml bottle', group: 'Skin' },
  { name: 'Diclofenac gel', genericName: 'Diclofenac Sodium', category: 'otc', estimatedPrice: 180, unit: '20 g tube', group: 'Skin' },
  { name: 'Lubricating eye drops', genericName: 'Carboxymethylcellulose', category: 'otc', estimatedPrice: 185, unit: '10 ml bottle', group: 'Eye & Ear' },
  { name: 'Antibiotic eye drops', genericName: 'Chloramphenicol', category: 'rx', estimatedPrice: 165, unit: '5 ml bottle', group: 'Eye & Ear' },
  { name: 'Ear drops', genericName: 'Ofloxacin', category: 'rx', estimatedPrice: 320, unit: '5 ml bottle', group: 'Eye & Ear' },
  { name: 'Digital thermometer', genericName: null, category: 'otc', estimatedPrice: 250, unit: 'Per piece', group: 'Supplies' },
  { name: 'Pregnancy test kit', genericName: null, category: 'otc', estimatedPrice: 60, unit: 'Per piece', group: 'Supplies' },
  { name: 'Blood glucose test strip', genericName: null, category: 'otc', estimatedPrice: 35, unit: 'Per strip', group: 'Supplies' },
  { name: 'Syringe 3cc', genericName: null, category: 'otc', estimatedPrice: 12, unit: 'Per piece', group: 'Supplies' },
  { name: 'Insulin syringe', genericName: null, category: 'otc', estimatedPrice: 20, unit: 'Per piece', group: 'Supplies' },
  { name: 'Infant formula milk (0-6 months)', genericName: null, category: 'otc', estimatedPrice: 330, unit: '400 g tin', group: 'Baby & Milk' },
  { name: 'Follow-on formula milk (6-12 months)', genericName: null, category: 'otc', estimatedPrice: 340, unit: '400 g tin', group: 'Baby & Milk' },
  { name: 'Growing-up milk (1-3 years)', genericName: null, category: 'otc', estimatedPrice: 300, unit: '400 g pack', group: 'Baby & Milk' },
  { name: 'Powdered milk (adult)', genericName: null, category: 'otc', estimatedPrice: 240, unit: '300 g pack', group: 'Baby & Milk' },
  { name: 'Diapers — newborn', genericName: null, category: 'otc', estimatedPrice: 12, unit: 'Per piece', group: 'Baby & Milk' },
  { name: 'Diapers — small', genericName: null, category: 'otc', estimatedPrice: 12, unit: 'Per piece', group: 'Baby & Milk' },
  { name: 'Diapers — medium', genericName: null, category: 'otc', estimatedPrice: 13, unit: 'Per piece', group: 'Baby & Milk' },
  { name: 'Diapers — large', genericName: null, category: 'otc', estimatedPrice: 14, unit: 'Per piece', group: 'Baby & Milk' },
  { name: 'Diapers — pack of 30', genericName: null, category: 'otc', estimatedPrice: 350, unit: 'Per pack', group: 'Baby & Milk' },
  { name: 'Baby wipes', genericName: null, category: 'otc', estimatedPrice: 85, unit: 'Pack of 80', group: 'Baby & Milk' },
  { name: 'Baby powder', genericName: null, category: 'otc', estimatedPrice: 75, unit: '100 g bottle', group: 'Baby & Milk' },
  { name: 'Baby bath soap', genericName: null, category: 'otc', estimatedPrice: 95, unit: 'Per bottle', group: 'Baby & Milk' },
  { name: 'Baby oil', genericName: null, category: 'otc', estimatedPrice: 90, unit: '100 ml bottle', group: 'Baby & Milk' },
  { name: 'Feeding bottle', genericName: null, category: 'otc', estimatedPrice: 150, unit: 'Per piece', group: 'Baby & Milk' },
  { name: 'Feeding bottle nipple', genericName: null, category: 'otc', estimatedPrice: 60, unit: 'Per piece', group: 'Baby & Milk' },
  { name: 'Petroleum jelly', genericName: null, category: 'otc', estimatedPrice: 75, unit: '50 g jar', group: 'Baby & Milk' },
  { name: 'Sanitary napkins', genericName: null, category: 'otc', estimatedPrice: 65, unit: 'Pack of 8', group: 'Personal Care' },
  { name: 'Panty liners', genericName: null, category: 'otc', estimatedPrice: 55, unit: 'Pack of 20', group: 'Personal Care' },
  { name: 'Adult diapers', genericName: null, category: 'otc', estimatedPrice: 35, unit: 'Per piece', group: 'Personal Care' },
  { name: 'Cotton buds', genericName: null, category: 'otc', estimatedPrice: 35, unit: 'Per pack', group: 'Personal Care' },
  { name: 'Hand sanitizer', genericName: 'Ethyl Alcohol Gel', category: 'otc', estimatedPrice: 75, unit: '60 ml bottle', group: 'Personal Care' },
  { name: 'Toothpaste', genericName: null, category: 'otc', estimatedPrice: 95, unit: 'Per tube', group: 'Personal Care' },
  { name: 'Bath soap', genericName: null, category: 'otc', estimatedPrice: 55, unit: 'Per bar', group: 'Personal Care' },
  { name: 'Shampoo sachet', genericName: null, category: 'otc', estimatedPrice: 10, unit: 'Per sachet', group: 'Personal Care' },

  // Antibiotics — prescription only
  { name: 'Amoxicillin 500mg', genericName: 'Amoxicillin', category: 'rx', estimatedPrice: 12, unit: 'Per capsule', group: 'Antibiotics' },
  { name: 'Cefalexin 500mg', genericName: 'Cefalexin', category: 'rx', estimatedPrice: 18, unit: 'Per capsule', group: 'Antibiotics' },
  { name: 'Co-amoxiclav 625mg', genericName: 'Amoxicillin + Clavulanic Acid', category: 'rx', estimatedPrice: 45, unit: 'Per tablet', group: 'Antibiotics' },
  { name: 'Azithromycin 500mg', genericName: 'Azithromycin', category: 'rx', estimatedPrice: 80, unit: 'Per tablet', group: 'Antibiotics' },
  { name: 'Cloxacillin 500mg', genericName: 'Cloxacillin', category: 'rx', estimatedPrice: 15, unit: 'Per capsule', group: 'Antibiotics' },
  { name: 'Cotrimoxazole 800mg/160mg', genericName: 'Sulfamethoxazole + Trimethoprim', category: 'rx', estimatedPrice: 12, unit: 'Per tablet', group: 'Antibiotics' },
  { name: 'Ciprofloxacin 500mg', genericName: 'Ciprofloxacin', category: 'rx', estimatedPrice: 25, unit: 'Per tablet', group: 'Antibiotics' },
  { name: 'Doxycycline 100mg', genericName: 'Doxycycline', category: 'rx', estimatedPrice: 15, unit: 'Per capsule', group: 'Antibiotics' },
  { name: 'Metronidazole 500mg', genericName: 'Metronidazole', category: 'rx', estimatedPrice: 10, unit: 'Per tablet', group: 'Antibiotics' },
  { name: 'Cefuroxime 500mg', genericName: 'Cefuroxime', category: 'rx', estimatedPrice: 45, unit: 'Per tablet', group: 'Antibiotics' },
  { name: 'Amoxicillin drops', genericName: 'Amoxicillin', category: 'rx', estimatedPrice: 210, unit: '15 ml dropper bottle', group: 'Antibiotics' },

  // Maintenance — prescription only
  { name: 'Metformin 500mg', genericName: 'Metformin', category: 'rx', estimatedPrice: 6, unit: 'Per tablet', group: 'Maintenance' },
  { name: 'Losartan 50mg', genericName: 'Losartan Potassium', category: 'rx', estimatedPrice: 10, unit: 'Per tablet', group: 'Maintenance' },
  { name: 'Amlodipine 10mg', genericName: 'Amlodipine', category: 'rx', estimatedPrice: 8, unit: 'Per tablet', group: 'Maintenance' },
  { name: 'Atorvastatin 20mg', genericName: 'Atorvastatin', category: 'rx', estimatedPrice: 20, unit: 'Per tablet', group: 'Maintenance' },
  { name: 'Prednisone 20mg', genericName: 'Prednisone', category: 'rx', estimatedPrice: 12, unit: 'Per tablet', group: 'Maintenance' },
  { name: 'Salbutamol nebule 2.5mg', genericName: 'Salbutamol', category: 'rx', estimatedPrice: 25, unit: 'Per nebule', group: 'Maintenance' },
  { name: 'Salbutamol inhaler', genericName: 'Salbutamol', category: 'rx', estimatedPrice: 480, unit: 'Per inhaler', group: 'Maintenance' },
  { name: 'Metoprolol 50mg', genericName: 'Metoprolol', category: 'rx', estimatedPrice: 12, unit: 'Per tablet', group: 'Maintenance' },
  { name: 'Telmisartan 40mg', genericName: 'Telmisartan', category: 'rx', estimatedPrice: 25, unit: 'Per tablet', group: 'Maintenance' },
  { name: 'Carvedilol 25mg', genericName: 'Carvedilol', category: 'rx', estimatedPrice: 15, unit: 'Per tablet', group: 'Maintenance' },
  { name: 'Furosemide 40mg', genericName: 'Furosemide', category: 'rx', estimatedPrice: 5, unit: 'Per tablet', group: 'Maintenance' },
  { name: 'Simvastatin 20mg', genericName: 'Simvastatin', category: 'rx', estimatedPrice: 12, unit: 'Per tablet', group: 'Maintenance' },
  { name: 'Clopidogrel 75mg', genericName: 'Clopidogrel', category: 'rx', estimatedPrice: 35, unit: 'Per tablet', group: 'Maintenance' },
  { name: 'Gliclazide 60mg', genericName: 'Gliclazide', category: 'rx', estimatedPrice: 25, unit: 'Per tablet', group: 'Maintenance' },
  { name: 'Glimepiride 2mg', genericName: 'Glimepiride', category: 'rx', estimatedPrice: 18, unit: 'Per tablet', group: 'Maintenance' },
  { name: 'Allopurinol 300mg', genericName: 'Allopurinol', category: 'rx', estimatedPrice: 12, unit: 'Per tablet', group: 'Maintenance' },
  { name: 'Colchicine 500mcg', genericName: 'Colchicine', category: 'rx', estimatedPrice: 25, unit: 'Per tablet', group: 'Maintenance' },
  { name: 'Levothyroxine 50mcg', genericName: 'Levothyroxine', category: 'rx', estimatedPrice: 12, unit: 'Per tablet', group: 'Maintenance' },
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
