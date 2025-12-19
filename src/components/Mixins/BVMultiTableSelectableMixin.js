export const selectedRowsMap = {};
export const tableHeaderCheckboxModelMap = {};
export const tableHeaderCheckboxIndeterminateMap = {};

const BVMultiTableSelectableMixin = {
  methods: {
    clearSelectedRows(tableRef) {
      if (tableRef) tableRef.clearSelected();
    },
    toggleSelectRow(tableRef, rowIndex) {
      if (tableRef) {
        const isSelected = tableRef.isRowSelected(rowIndex);
        if (isSelected) {
          tableRef.unselectRow(rowIndex);
          // Uncheck header checkbox when unselecting a row
          const index = Array.from(this.$refs.tables).indexOf(tableRef);
          this.tableHeaderCheckboxModelMap[index] = false;
        } else {
          tableRef.selectRow(rowIndex);
        }
      }
    },
    onRowSelected(selectedRows, totalRowsCount, index = 0) {
      this.selectedRowsMap[index] = selectedRows;
      // Update header checkbox state
      const selectedCount = selectedRows.length;
      this.tableHeaderCheckboxModelMap[index] =
        selectedCount === totalRowsCount;
      this.tableHeaderCheckboxIndeterminateMap[index] =
        selectedCount > 0 && selectedCount < totalRowsCount;
    },
    onChangeHeaderCheckbox(tableRef) {
      const index = Array.from(this.$refs.tables).indexOf(tableRef);
      const checked = this.tableHeaderCheckboxModelMap[index];
      if (tableRef) {
        if (checked) tableRef.selectAllRows();
        else tableRef.clearSelected();
      }
    },
    getTableIndex(tableRef) {
      return Array.from(this.$refs.tables).indexOf(tableRef);
    },
  },
};

export default BVMultiTableSelectableMixin;
