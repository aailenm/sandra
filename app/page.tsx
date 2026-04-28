"use client";

import { ChangeEvent, useMemo, useState } from "react";
import * as XLSX from "xlsx";

const REQUIRED_HEADERS = [
  "Tipo Cambio",
  "Moneda",
  "Neto Gravado",
  "No Gravado",
  "Exento",
  "IVA",
  "Total",
] as const;

type StatusType = "processed" | "skipped" | "error";

type FileResult = {
  name: string;
  status: StatusType;
  message: string;
  downloadName?: string;
  downloadUrl?: string;
};

type HeaderMatch = {
  rowIndex: number;
  columnIndexMap: Record<(typeof REQUIRED_HEADERS)[number], number>;
};

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return Number(value ?? 0);

  const trimmed = value.trim();
  if (!trimmed) return 0;

  const normalized =
    trimmed.includes(",") && trimmed.includes(".")
      ? trimmed.replace(/\./g, "").replace(",", ".")
      : trimmed.replace(",", ".");

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getCellValue(row: unknown[], index: number) {
  return index >= 0 ? row[index] : undefined;
}

function findHeaderRow(rows: unknown[][]): HeaderMatch | null {
  const normalizedHeaders = REQUIRED_HEADERS.map((header) => normalizeHeader(header));

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const normalizedRow = row.map((cell) => normalizeHeader(cell));
    const columnIndexMap = {} as Record<(typeof REQUIRED_HEADERS)[number], number>;

    let allFound = true;

    REQUIRED_HEADERS.forEach((header, index) => {
      const columnIndex = normalizedRow.indexOf(normalizedHeaders[index]);
      if (columnIndex === -1) {
        allFound = false;
        return;
      }
      columnIndexMap[header] = columnIndex;
    });

    if (allFound) {
      return { rowIndex, columnIndexMap };
    }
  }

  return null;
}

function createOutputName(fileName: string) {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex === -1) return `${fileName}_ARS.xlsx`;
  return `${fileName.slice(0, dotIndex)}_ARS${fileName.slice(dotIndex)}`;
}

async function processWorkbook(file: File): Promise<FileResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: "",
      raw: false,
    });
    const headerMatch = findHeaderRow(rows);

    if (!headerMatch) {
      continue;
    }

    const { rowIndex, columnIndexMap } = headerMatch;

    for (let currentRowIndex = rowIndex + 1; currentRowIndex < rows.length; currentRowIndex += 1) {
      const row = rows[currentRowIndex];
      const currency = String(getCellValue(row, columnIndexMap.Moneda) ?? "")
        .trim()
        .toUpperCase();
      const exchangeRate = toNumber(getCellValue(row, columnIndexMap["Tipo Cambio"]));
      const multiplier = currency === "USD" ? exchangeRate : 1;

      const amounts = [
        toNumber(getCellValue(row, columnIndexMap["Neto Gravado"])),
        toNumber(getCellValue(row, columnIndexMap["No Gravado"])),
        toNumber(getCellValue(row, columnIndexMap.Exento)),
        toNumber(getCellValue(row, columnIndexMap.IVA)),
        toNumber(getCellValue(row, columnIndexMap.Total)),
      ];

      row[columnIndexMap["Neto Gravado"]] = amounts[0] * multiplier;
      row[columnIndexMap["No Gravado"]] = amounts[1] * multiplier;
      row[columnIndexMap.Exento] = amounts[2] * multiplier;
      row[columnIndexMap.IVA] = amounts[3] * multiplier;
      row[columnIndexMap.Total] = amounts[4] * multiplier;
    }

    const outputWorksheet = XLSX.utils.aoa_to_sheet(rows);
    workbook.Sheets[sheetName] = outputWorksheet;

    const output = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    });
    const blob = new Blob([output], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    return {
      name: file.name,
      status: "processed",
      message: `Hoja procesada: "${sheetName}"`,
      downloadName: createOutputName(file.name),
      downloadUrl: URL.createObjectURL(blob),
    };
  }

  return {
    name: file.name,
    status: "skipped",
    message: "No se encontro ninguna hoja con los encabezados requeridos",
  };
}

export default function Home() {
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<FileResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const summary = useMemo(() => {
    return {
      processed: results.filter((result) => result.status === "processed").length,
      skipped: results.filter((result) => result.status === "skipped").length,
      errors: results.filter((result) => result.status === "error").length,
    };
  }, [results]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFiles = Array.from(event.target.files ?? []);
    setFiles(nextFiles);
    setResults([]);
  }

  async function handleProcess() {
    if (!files.length) return;

    results.forEach((result) => {
      if (result.downloadUrl) {
        URL.revokeObjectURL(result.downloadUrl);
      }
    });

    setIsProcessing(true);
    const nextResults: FileResult[] = [];

    for (const file of files) {
      try {
        const result = await processWorkbook(file);
        nextResults.push(result);
      } catch (error) {
        nextResults.push({
          name: file.name,
          status: "error",
          message: error instanceof Error ? error.message : "Error desconocido al procesar",
        });
      }
    }

    setResults(nextResults);
    setIsProcessing(false);
  }

  return (
    <main className="page">
      <section className="panel">
        <h1>Excel a ARS</h1>
        <p>
          Subi uno o varios archivos <code>.xlsx</code>, procesalos completamente en tu navegador y
          descarga las copias convertidas.
        </p>

        <input type="file" accept=".xlsx" multiple onChange={handleFileChange} />

        <button type="button" onClick={handleProcess} disabled={!files.length || isProcessing}>
          {isProcessing ? "Procesando..." : "Procesar archivos"}
        </button>

        <div className="summary">
          <span>Procesados: {summary.processed}</span>
          <span>Omitidos: {summary.skipped}</span>
          <span>Errores: {summary.errors}</span>
        </div>

        <ul className="statusList">
          {results.map((result) => (
            <li key={`${result.status}-${result.name}`} className={`statusItem ${result.status}`}>
              <div>
                <strong>{result.name}</strong>
                <p>{result.message}</p>
              </div>
              {result.downloadUrl ? (
                <a href={result.downloadUrl} download={result.downloadName}>
                  Descargar
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
