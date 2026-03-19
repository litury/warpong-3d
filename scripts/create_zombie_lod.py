"""
Create a low-poly LOD version of zombie.glb using Blender's Decimate modifier.
Run headless: /Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/create_zombie_lod.py
"""
import bpy
import os
import sys

# Paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
INPUT_GLB = os.path.join(PROJECT_DIR, "client-babylon", "public", "assets", "zombie.glb")
OUTPUT_GLB = os.path.join(PROJECT_DIR, "client-babylon", "public", "assets", "zombie_lod.glb")

# Target ratio: ~500 tris from ~5000 = 0.1 ratio
DECIMATE_RATIO = 0.1

print(f"Input:  {INPUT_GLB}")
print(f"Output: {OUTPUT_GLB}")

# Clear default scene
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

# Clear orphan data
for block in bpy.data.meshes:
    if block.users == 0:
        bpy.data.meshes.remove(block)
for block in bpy.data.armatures:
    if block.users == 0:
        bpy.data.armatures.remove(block)
for block in bpy.data.actions:
    if block.users == 0:
        bpy.data.actions.remove(block)

# Import the GLB
bpy.ops.import_scene.gltf(filepath=INPUT_GLB)

# Count original triangles
total_tris_before = 0
mesh_objects = [obj for obj in bpy.data.objects if obj.type == 'MESH']
for obj in mesh_objects:
    # Ensure mesh data is evaluated
    depsgraph = bpy.context.evaluated_depsgraph_get()
    eval_obj = obj.evaluated_get(depsgraph)
    eval_mesh = eval_obj.to_mesh()
    total_tris_before += len(eval_mesh.loop_triangles)
    eval_obj.to_mesh_clear()

print(f"Original triangle count: {total_tris_before}")

# Apply Decimate modifier to each mesh
for obj in mesh_objects:
    # Select and set active
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)

    # Add decimate modifier
    mod = obj.modifiers.new(name="Decimate_LOD", type='DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.ratio = DECIMATE_RATIO
    # Use vertex groups to preserve important areas if available
    mod.use_collapse_triangulate = True

    # Apply the modifier
    bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.select_set(False)

# Count final triangles
total_tris_after = 0
for obj in mesh_objects:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    eval_obj = obj.evaluated_get(depsgraph)
    eval_mesh = eval_obj.to_mesh()
    total_tris_after += len(eval_mesh.loop_triangles)
    eval_obj.to_mesh_clear()

print(f"Decimated triangle count: {total_tris_after}")
print(f"Reduction: {total_tris_before} -> {total_tris_after} ({100*(1 - total_tris_after/max(total_tris_before,1)):.1f}% reduction)")

# Select all objects for export
bpy.ops.object.select_all(action='SELECT')

# Export as GLB (includes animations and armature)
bpy.ops.export_scene.gltf(
    filepath=OUTPUT_GLB,
    export_format='GLB',
    export_animations=True,
    export_skins=True,
    use_selection=False,
    export_apply=False,
)

print(f"Exported: {OUTPUT_GLB}")

# Verify file size
file_size = os.path.getsize(OUTPUT_GLB)
print(f"File size: {file_size / 1024:.1f} KB")
