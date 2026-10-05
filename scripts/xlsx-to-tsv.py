#!/usr/bin/env python3
"""Exports the HR staff workbook's first sheet to TSV for scripts/import-employees.ts.

    python3 scripts/xlsx-to-tsv.py "<xlsx path>" "<tsv path outside the repo>"

The TSV holds personal data: write it outside the repo and delete it afterwards.
"""
import sys
import openpyxl

src, dst = sys.argv[1], sys.argv[2]
ws = openpyxl.load_workbook(src, data_only=True, read_only=True).worksheets[0]
with open(dst, "w", encoding="utf-8") as out:
    for row in ws.iter_rows(values_only=True):
        if not any(row):
            continue
        out.write("\t".join("" if v is None else str(v).replace("\t", " ").strip() for v in row) + "\n")
print(f"{dst} yazıldı.")
