/**
 * Strip mesh/skin/material/texture data from animation GLBs.
 * Keeps only: skeleton nodes + animation data (with meshopt compression).
 * This eliminates Draco mesh decompression at runtime.
 *
 * Usage: node scripts/strip-anim-meshes.mjs
 */

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import { readdir, stat } from "fs/promises";
import { join } from "path";

const ANIM_DIRS = [
  "public/assets/zombie/anims",
  "public/assets/mech/anims",
];

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    "meshopt.decoder": MeshoptDecoder,
    "meshopt.encoder": MeshoptEncoder,
  });

async function stripMeshFromGLB(filePath) {
  const doc = await io.read(filePath);
  const root = doc.getRoot();

  const hadMeshes = root.listMeshes().length > 0;
  const hadSkins = root.listSkins().length > 0;

  if (!hadMeshes && !hadSkins) return false;

  // Remove all meshes and related data
  for (const mesh of root.listMeshes()) mesh.dispose();
  for (const mat of root.listMaterials()) mat.dispose();
  for (const tex of root.listTextures()) tex.dispose();

  // Remove skin/mesh references from nodes
  for (const node of root.listNodes()) {
    if (node.getSkin()) node.setSkin(null);
    if (node.getMesh()) node.setMesh(null);
  }

  // Remove skins
  for (const skin of root.listSkins()) skin.dispose();

  // Remove Draco extension (only used for mesh compression)
  for (const ext of root.listExtensionsUsed()) {
    if (
      ext.extensionName === "KHR_draco_mesh_compression" ||
      ext.extensionName === "KHR_mesh_quantization"
    ) {
      ext.dispose();
    }
  }

  await io.write(filePath, doc);
  return true;
}

async function processDir(dir) {
  const fullDir = join(process.cwd(), dir);
  try {
    if (!(await stat(fullDir)).isDirectory()) return;
  } catch {
    console.log(`  Skipping ${dir} (not found)`);
    return;
  }

  const files = (await readdir(fullDir)).filter((f) => f.endsWith(".glb"));
  console.log(`\n${dir}: ${files.length} GLB files`);

  for (const file of files) {
    const filePath = join(fullDir, file);
    const beforeSize = (await stat(filePath)).size;
    const stripped = await stripMeshFromGLB(filePath);
    const afterSize = (await stat(filePath)).size;

    if (stripped) {
      const saved = ((1 - afterSize / beforeSize) * 100).toFixed(0);
      console.log(
        `  ${file}: ${(beforeSize / 1024).toFixed(0)}KB → ${(afterSize / 1024).toFixed(0)}KB (-${saved}%)`,
      );
    } else {
      console.log(`  ${file}: no mesh data, skipped`);
    }
  }
}

console.log("Stripping mesh data from animation GLBs...");
for (const dir of ANIM_DIRS) {
  await processDir(dir);
}
console.log("\nDone!");
