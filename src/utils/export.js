// Builds a human-readable .xlsx workbook of all saved finds (and manual
// groups, if any) — replaces the old JSON export, which dumped every field
// (including each photo as a giant base64 string) as raw, unreadable JSON.
// Photos are intentionally left out: they're already viewable from each
// entry's detail screen, and there's no reasonable place to put embedded
// image data in a spreadsheet cell.
import * as XLSX from 'xlsx'
import { categoryLabel } from './grouping.js'

function mapLink(entry) {
  if (entry.latitude == null || entry.longitude == null) return ''
  return `https://www.google.com/maps?q=${entry.latitude},${entry.longitude}`
}

function entryRow(entry) {
  return {
    Date: entry.dateAdded ? new Date(entry.dateAdded) : '',
    Brand: entry.brand || '',
    Category: entry.category ? categoryLabel(entry.category) : '',
    Subcategory: entry.subcategory || '',
    Price: entry.price ?? '',
    Currency: entry.currency || '',
    Location: entry.storeName || '',
    'Store #': entry.storeNumber || '',
    Description: entry.description || '',
    'Map Link': mapLink(entry),
  }
}

function groupRow(group, entriesById) {
  const finds = group.entryIds
    .map((id) => entriesById.get(id))
    .filter(Boolean)
    .map((e) => [e.brand, e.category ? categoryLabel(e.category) : ''].filter(Boolean).join(' – '))
    .join(', ')
  return { Group: group.name, Finds: finds }
}

export function exportEntriesAsXlsx(entries, groups) {
  const sorted = [...entries].sort((a, b) => b.dateAdded - a.dateAdded)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(sorted.map(entryRow)), 'Finds')

  if (groups.length > 0) {
    const entriesById = new Map(entries.map((e) => [e.id, e]))
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(groups.map((g) => groupRow(g, entriesById))),
      'Groups'
    )
  }

  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  return new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
