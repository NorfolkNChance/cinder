export { markdownSchema, editorExtensions } from './schema';
export { serialize } from './serialize';
export { deserialize } from './deserialize';
// Note: mapImageSrcs is intentionally NOT re-exported here. The main process
// uses it, and importing it through this barrel would pull schema.ts (TipTap)
// into main. Import it directly from './imageSrcs'.
