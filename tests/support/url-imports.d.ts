// Tests reach the scene's asset URLs (`src/scene/assetUrls.ts`); Vitest resolves `?url` like Vite.
declare module '*?url' {
  const url: string;
  export default url;
}
