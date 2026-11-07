'use client';
import { useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, GridOptions, RowClickedEvent } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import { Button } from '.';

/**
 * The one place AG Grid is configured. Every table in the product (invoices, vendors, audit trail)
 * gets sorting, filtering, resizing, pagination and CSV export from here, so screens only declare columns.
 */
export function DataGrid<T>({ rows, columns, onRowClick, height = 520, exportName, getRowId, quickFilter }: {
  rows: T[]; columns: ColDef<T>[]; onRowClick?: (row: T) => void; height?: number; exportName?: string;
  getRowId?: (row: T) => string; quickFilter?: string;
}) {
  const ref = useRef<AgGridReact<T>>(null);
  const options: GridOptions<T> = {
    defaultColDef: { sortable: true, filter: true, resizable: true, flex: 1, minWidth: 110 },
    animateRows: true, suppressCellFocus: true, rowHeight: 46, headerHeight: 42,
    getRowId: getRowId ? (p) => getRowId(p.data) : undefined,
    onRowClicked: onRowClick ? (e: RowClickedEvent<T>) => e.data && onRowClick(e.data) : undefined,
    rowStyle: onRowClick ? { cursor: 'pointer' } : undefined,
    pagination: rows.length > 50, paginationPageSize: 50,
  };
  return (
    <div className="stack-sm">
      {exportName && (
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button size="sm" onClick={() => ref.current?.api.exportDataAsCsv({ fileName: `${exportName}.csv` })}>Export CSV</Button>
        </div>
      )}
      <div className="ag-theme-quartz-dark" style={{ height, width: '100%' }}>
        <AgGridReact<T> ref={ref} rowData={rows} columnDefs={columns} gridOptions={options} quickFilterText={quickFilter} />
      </div>
    </div>
  );
}
