1. **Update Dependencies**
   - Use `three@0.169.0` (which we just installed) and add `@pixiv/three-vrm` via unpkg CDN in `index.html` to avoid bundling node modules, aligning with how the project runs on the frontend (vanilla js). Alternatively, use import maps in `index.html` to load three and three-vrm modules.
2. **Rewrite 3D Avatar Loading in `index.html`**
   - Import `three`, `GLTFLoader`, and `VRMLoaderPlugin`.
   - In `init3DAvatar()`, fetch `/models/idealita.vrm`.
   - Setup basic Three.js scene, camera, renderer, lighting matching current aesthetic.
   - Attach VRM to scene.
   - Remove existing primitive-based avatar code (`craniumMesh`, `jawMesh`, etc).
3. **VRM Lip-Sync & Animation Loop**
   - Extract amplitude data via `window.avatarAnalyser`.
   - Drive VRM blendshapes (expressions like `Aa`, `Ih`, `Ou`, `Ee`, `Oh` or just generalized mouth opening based on amplitude if specific ones are unavailable).
   - In `animate3DAvatar()`, call `vrm.update(deltaTime)`.
   - Manage memory cleanup on `stopLive()` (dispose of vrm object, materials, geometries).
4. **Pre-commit Steps**
   - Ensure proper testing, verifications, reviews and reflections are done.
5. **Submit Changes**
   - Open a PR or submit the branch cleanly, documenting that `public/models/idealita.vrm` must be placed manually.
