const BVMultiTableSelectableMixin = {
  methods: {
    clearSelectedRows(tableRef) {
      if (tableRef) {
        tableRef.clearSelected();
        const index = this.getTableIndex(tableRef);
        if (index >= 0) {
          this.selectedRowsMap[index] = [];
          this.tableHeaderCheckboxModelMap[index] = false;
          this.tableHeaderCheckboxIndeterminateMap[index] = false;
        }
      }
    },
    toggleSelectRow(tableRef, rowIndex) {
      if (tableRef && rowIndex !== undefined) {
        const tableIndex = this.getTableIndex(tableRef);

        // Convert page-relative index to absolute index in the full items array
        // Support both single-table (currentPage/perPage) and multi-table (currentPageMap/perPageMap) patterns
        const currentPage =
          (this.currentPageMap && this.currentPageMap[tableIndex]) ||
          this.currentPage ||
          1;
        const perPage =
          (this.perPageMap && this.perPageMap[tableIndex]) ||
          this.perPage ||
          10;
        const absoluteIndex = (currentPage - 1) * perPage + rowIndex;

        const wasSelected = tableRef.isRowSelected(absoluteIndex);

        if (wasSelected) {
          tableRef.unselectRow(absoluteIndex);
        } else {
          tableRef.selectRow(absoluteIndex);
        }

        // Trigger update after toggle
        this.$nextTick(() => {
          if (tableIndex >= 0) {
            this.updateSelectionState(tableRef, tableIndex);
          }
        });
      }
    },
    onRowSelected(selectedRows, totalRowsCount, index = 0) {
      this.selectedRowsMap[index] = selectedRows;
      // Update header checkbox state
      const selectedCount = selectedRows.length;
      this.tableHeaderCheckboxModelMap[index] =
        selectedCount === totalRowsCount && totalRowsCount > 0;
      this.tableHeaderCheckboxIndeterminateMap[index] =
        selectedCount > 0 && selectedCount < totalRowsCount;
    },
    onChangeHeaderCheckbox(tableRef, event) {
      const index = this.getTableIndex(tableRef);
      if (index < 0 || !tableRef) return;

      // Extract checked state from event (could be boolean or Event object)
      const isChecked =
        typeof event === 'boolean' ? event : event?.target?.checked;

      if (isChecked) {
        tableRef.selectAllRows();
      } else {
        tableRef.clearSelected();
        this.selectedRowsMap[index] = [];
        this.tableHeaderCheckboxModelMap[index] = false;
        this.tableHeaderCheckboxIndeterminateMap[index] = false;
      }

      // Update state after action
      this.$nextTick(() => {
        this.updateSelectionState(tableRef, index);
      });
    },
    getTableIndex(tableRef) {
      const tables = this.$refs.tables;
      if (!tables) return -1;
      return Array.from(tables).indexOf(tableRef);
    },
    updateSelectionState(tableRef, index) {
      if (!tableRef) return;

      // Query the table's actual selection state
      const allItems = tableRef.filteredItems || tableRef.items || [];
      const selectedItems = allItems.filter((_, i) => tableRef.isRowSelected(i));

      this.selectedRowsMap[index] = selectedItems;

      const totalCount = allItems.length;
      const selectedCount = selectedItems.length;

      if (selectedCount === 0) {
        this.tableHeaderCheckboxModelMap[index] = false;
        this.tableHeaderCheckboxIndeterminateMap[index] = false;
      } else if (selectedCount === totalCount) {
        this.tableHeaderCheckboxModelMap[index] = true;
        this.tableHeaderCheckboxIndeterminateMap[index] = false;
      } else {
        this.tableHeaderCheckboxModelMap[index] = false;
        this.tableHeaderCheckboxIndeterminateMap[index] = true;
      }
    },
  },
};

export default BVMultiTableSelectableMixin;
