import * as XLSX from 'xlsx'
import type { MedicineProduct } from '../types'

// Menu import/export via a real spreadsheet file — lets a vendor build (or
// bulk-edit) their menu in Excel/Google Sheets instead of typing each dish
// into the app, and hand a copy to someone else the same way. Uses SheetJS
// (the `xlsx` package) rather than hand-rolled CSV parsing because a real
// .xlsx is a zipped binary format, not text — there's no lightweight way to
// read/write one without a library, and the same library reads/writes plain
// CSV too, so one code path covers both.

export type SpreadsheetFormat = 'csv' | 'xlsx'

const COLUMN_HEADERS = ['Name', 'Category', 'Price', 'In Stock'] as const

function safeFileNamePart(text: string): string {
  return text.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'menu'
}

// Downloads the vendor's current menu as a spreadsheet — also doubles as a
// template when the menu is empty, since the header row still comes through.
export function downloadMenuSpreadsheet(products: MedicineProduct[], vendorName: string, format: SpreadsheetFormat) {
  const rows = products.map((p) => ({
    Name: p.name,
    Category: p.menuCategory ?? '',
    Price: p.price,
    'In Stock': p.inStock ? 'Yes' : 'No',
  }))
  const worksheet = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [], { header: [...COLUMN_HEADERS] })
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Menu')
  XLSX.writeFile(workbook, `${safeFileNamePart(vendorName)}-menu.${format}`, { bookType: format })
}

export interface ParsedSpreadsheetRow {
  name: string
  price: number | null
  category: string | null
}

// Matches a header cell against a list of names a vendor might plausibly
// have typed (case/spacing-insensitive) — someone pasting from an existing
// spreadsheet rarely uses this app's exact column names.
function findColumn(row: Record<string, unknown>, aliases: string[]): unknown {
  const entry = Object.entries(row).find(([key]) => aliases.includes(key.trim().toLowerCase()))
  return entry?.[1]
}

// Reads any sheet-based file (.csv, .xls, .xlsx, .ods) SheetJS understands
// and pulls out name/price/category — same shape the other bulk-add tools
// (paste-menu-text, menu-board crop) hand back, so they share one review UI.
export async function parseMenuSpreadsheet(file: File): Promise<ParsedSpreadsheetRow[]> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) return []
  const sheet = workbook.Sheets[firstSheetName]
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

  return rawRows
    .map((row): ParsedSpreadsheetRow => {
      const name = String(findColumn(row, ['name', 'item', 'item name', 'dish', 'product', 'menu item']) ?? '').trim()
      const priceRaw = findColumn(row, ['price', 'cost', 'amount', 'php', 'peso', 'price (php)'])
      const priceNum = priceRaw === undefined || priceRaw === '' ? NaN : Number(priceRaw)
      const categoryRaw = findColumn(row, ['category', 'type', 'menu category', 'section'])
      return {
        name,
        price: Number.isFinite(priceNum) ? priceNum : null,
        category: categoryRaw ? String(categoryRaw).trim() : null,
      }
    })
    .filter((r) => r.name)
}
