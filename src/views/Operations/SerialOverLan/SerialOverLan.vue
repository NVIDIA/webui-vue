<template>
  <div class="sol-page">
    <serial-over-lan-console :is-full-window="false" />
  </div>
</template>

<script setup>
import SerialOverLanConsole from './SerialOverLanConsole';
</script>

<style lang="scss">
// Full-bleed console - fill the entire content area.
// The SOL page needs a fully height-constrained layout chain from the
// grid root down to the terminal so that xterm.js can't push the page
// into a scrollable state (e.g. after exiting fullscreen mode).

// 1. Constrain the grid to the viewport so rows can't grow beyond it.
//    grid-template-rows: auto 1fr ensures the header row stays at its
//    intrinsic content height and the content row takes all remaining
//    space.  Without 1fr, both rows are 'auto' and CSS Grid distributes
//    free space to both — inflating the header on initial render.
.app-container:has(.sol-page) {
  height: 100vh;
  overflow: hidden;
  grid-template-rows: auto 1fr;
}

// 2. Grid content cell — flex column so #main-content can use flex: 1
.app-content:has(.sol-page) {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

// 3. PageContainer wrapper div — bridge between grid cell and #main-content
#main-content:has(.sol-page) {
  padding: 0 !important;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.sol-page {
  padding: 0;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
</style>
