#!/usr/bin/env python3
"""
usd_to_glb.py — Convert Isaac Sim OmniPBR USD assets to GLB for Three.js.

Handles:
- OmniPBR MDL shaders (extracts diffuse_texture, normal_map_texture,
  reflectionroughness_texture, metallic_texture)
- UsdPreviewSurface shaders (standard path)
- Triangulated meshes with per-vertex normals and UVs
- Multiple meshes per USD stage
- Embeds textures into the GLB binary

Usage:
    python usd_to_glb.py <input.usd> <output.glb>
    python usd_to_glb.py --batch <input_dir> <output_dir>
"""

import argparse
import os
import struct
import sys
import json
import base64
from pathlib import Path
import numpy as np

try:
    from pxr import Usd, UsdGeom, UsdShade, Sdf, Vt
except ImportError:
    sys.exit("ERROR: pxr (usd-core) not installed. Run: pip install usd-core")


# ---------------------------------------------------------------------------
# Utility: Pack binary data, returning (byte_offset, byte_length)
# ---------------------------------------------------------------------------

class BinaryBuffer:
    def __init__(self):
        self._data = bytearray()

    def add(self, data: bytes) -> tuple[int, int]:
        """Append data aligned to 4 bytes. Returns (offset, length)."""
        offset = len(self._data)
        self._data.extend(data)
        # Pad to 4-byte alignment
        pad = (4 - len(self._data) % 4) % 4
        self._data.extend(b'\x00' * pad)
        return offset, len(data)

    @property
    def data(self) -> bytes:
        return bytes(self._data)

    @property
    def length(self) -> int:
        return len(self._data)


# ---------------------------------------------------------------------------
# Texture loading — embed as base64 data URI or raw bytes
# ---------------------------------------------------------------------------

def load_texture_bytes(texture_path: str) -> tuple[bytes, str] | None:
    """Load texture file as bytes. Returns (bytes, mime_type) or None."""
    if not texture_path:
        return None
    p = Path(texture_path)
    if not p.exists():
        print(f"  WARNING: texture not found: {texture_path}")
        return None
    ext = p.suffix.lower()
    mime = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
    }.get(ext, 'image/png')
    return p.read_bytes(), mime


# ---------------------------------------------------------------------------
# Material extraction — handles OmniPBR and UsdPreviewSurface
# ---------------------------------------------------------------------------

def resolve_asset_path(attr_path: str, usd_dir: str) -> str:
    """Resolve a USD asset path (possibly relative) against the USD file dir."""
    if not attr_path:
        return ''
    p = Path(attr_path)
    if p.is_absolute() and p.exists():
        return str(p)
    resolved = Path(usd_dir) / attr_path
    if resolved.exists():
        return str(resolved)
    return str(p)


def extract_omnipbr_material(shader_prim, usd_dir: str) -> dict:
    """Extract texture paths from an OmniPBR MDL shader."""
    tex = {}
    for attr in shader_prim.GetAttributes():
        name = attr.GetName()
        val = attr.Get()
        if val is None:
            continue
        if isinstance(val, Sdf.AssetPath):
            path = val.resolvedPath or val.path
            if path:
                resolved = resolve_asset_path(path, usd_dir)
                if 'diffuse_texture' in name or 'albedo' in name.lower():
                    tex['diffuse'] = resolved
                elif 'normal_map_texture' in name:
                    tex['normal'] = resolved
                elif 'reflectionroughness_texture' in name or 'roughness_texture' in name:
                    tex['roughness'] = resolved
                elif 'metallic_texture' in name:
                    tex['metallic'] = resolved
                elif 'emissive_mask_texture' in name or 'emissive_texture' in name:
                    tex['emissive'] = resolved
    # Scalar fallbacks
    for attr in shader_prim.GetAttributes():
        name = attr.GetName()
        val = attr.Get()
        if val is None:
            continue
        if 'metallic_constant' in name and 'metallic' not in tex:
            tex['metallic_factor'] = float(val)
        elif 'reflection_roughness_constant' in name and 'roughness' not in tex:
            tex['roughness_factor'] = float(val)
        elif 'diffuse_color_constant' in name and 'diffuse' not in tex and 'base_color' not in tex:
            # Vec3f color constant — use as base color factor
            try:
                tex['base_color'] = [float(val[0]), float(val[1]), float(val[2])]
            except (TypeError, IndexError):
                pass
    return tex


def extract_preview_surface_material(shader_prim, usd_dir: str) -> dict:
    """Extract texture paths from a UsdPreviewSurface shader."""
    tex = {}
    shader = UsdShade.Shader(shader_prim)

    def get_input_texture(input_name):
        inp = shader.GetInput(input_name)
        if inp and inp.HasConnectedSource():
            sources = inp.GetConnectedSources()
            for src_list in sources:
                for src in src_list:
                    sampler_prim = src.source.GetPrim()
                    file_attr = sampler_prim.GetAttribute('inputs:file')
                    if file_attr:
                        val = file_attr.Get()
                        if val:
                            path = val.resolvedPath or val.path
                            return resolve_asset_path(path, usd_dir)
        return None

    def get_input_value(input_name):
        inp = shader.GetInput(input_name)
        if inp and not inp.HasConnectedSource():
            return inp.Get()
        return None

    t = get_input_texture('diffuseColor')
    if t:
        tex['diffuse'] = t
    t = get_input_texture('normal')
    if t:
        tex['normal'] = t
    t = get_input_texture('roughness')
    if t:
        tex['roughness'] = t
    t = get_input_texture('metallic')
    if t:
        tex['metallic'] = t

    v = get_input_value('metallic')
    if v is not None and 'metallic' not in tex:
        tex['metallic_factor'] = float(v)
    v = get_input_value('roughness')
    if v is not None and 'roughness' not in tex:
        tex['roughness_factor'] = float(v)
    v = get_input_value('diffuseColor')
    if v is not None and 'diffuse' not in tex:
        tex['base_color'] = [float(v[0]), float(v[1]), float(v[2])]

    return tex


def get_material_for_mesh(mesh_prim, usd_dir: str) -> dict:
    """Get material texture info for a mesh prim."""
    binding_api = UsdShade.MaterialBindingAPI(mesh_prim)
    binding = binding_api.GetDirectBinding()
    mat_path = binding.GetMaterialPath()
    if not mat_path:
        return {}

    stage = mesh_prim.GetStage()
    mat_prim = stage.GetPrimAtPath(mat_path)
    if not mat_prim or not mat_prim.IsValid():
        return {}

    material = UsdShade.Material(mat_prim)

    # Find shaders under the material
    for child in mat_prim.GetChildren():
        if child.IsA(UsdShade.Shader):
            shader = UsdShade.Shader(child)
            impl_source = child.GetAttribute('info:implementationSource').Get()
            shader_id = shader.GetShaderId()

            # OmniPBR (MDL-based)
            if impl_source == 'sourceAsset' or (
                child.GetAttribute('info:mdl:sourceAsset').Get() is not None
            ):
                return extract_omnipbr_material(child, usd_dir)

            # UsdPreviewSurface
            if shader_id and 'UsdPreviewSurface' in str(shader_id):
                return extract_preview_surface_material(child, usd_dir)

            # Fallback: try OmniPBR extraction anyway
            result = extract_omnipbr_material(child, usd_dir)
            if result:
                return result

    return {}


# ---------------------------------------------------------------------------
# Mesh extraction
# ---------------------------------------------------------------------------

def triangulate_mesh(points, indices, counts, normals, uvs):
    """
    Fan-triangulate non-triangle faces. Returns new (verts, indices, normals, uvs).
    All inputs should be numpy arrays. uvs may be None.
    """
    tri_verts = []
    tri_normals = []
    tri_uvs = [] if uvs is not None else None
    tri_indices = []

    idx = 0
    for count in counts:
        face_indices = indices[idx:idx + count]
        # Fan triangulation from first vertex
        for i in range(1, count - 1):
            for fi in [0, i, i + 1]:
                vi = face_indices[fi]
                tri_verts.append(points[vi])
                tri_normals.append(normals[vi] if normals is not None else [0, 0, 1])
                if uvs is not None:
                    tri_uvs.append(uvs[vi])
        idx += count

    verts_np = np.array(tri_verts, dtype=np.float32)
    norms_np = np.array(tri_normals, dtype=np.float32)
    uvs_np = np.array(tri_uvs, dtype=np.float32) if tri_uvs is not None else None

    # Build sequential indices (already expanded, so 0..N-1)
    n = len(verts_np)
    idx_np = np.arange(n, dtype=np.uint32)

    return verts_np, idx_np, norms_np, uvs_np


def extract_mesh_data(mesh_prim):
    """Extract geometry from a UsdGeom.Mesh prim. Returns dict or None."""
    mesh = UsdGeom.Mesh(mesh_prim)

    pts = mesh.GetPointsAttr().Get()
    indices = mesh.GetFaceVertexIndicesAttr().Get()
    counts = mesh.GetFaceVertexCountsAttr().Get()

    if pts is None or indices is None or counts is None:
        print(f"  SKIP {mesh_prim.GetPath()}: missing geometry attributes")
        return None

    pts = np.array(pts, dtype=np.float32)
    indices = np.array(indices, dtype=np.int32)
    counts = np.array(counts, dtype=np.int32)

    # Normals
    normals_attr = mesh.GetNormalsAttr().Get()
    if normals_attr is not None:
        normals = np.array(normals_attr, dtype=np.float32)
        norm_interp = mesh.GetNormalsInterpolation()
    else:
        normals = None
        norm_interp = 'vertex'

    # UV (st primvar)
    pvapi = UsdGeom.PrimvarsAPI(mesh_prim)
    uvs = None
    uv_interp = 'vertex'
    for pv_name in ['st', 'UVMap', 'uv']:
        pv = pvapi.GetPrimvar(pv_name)
        if pv and pv.IsDefined():
            uv_data = pv.Get()
            if uv_data:
                uvs = np.array(uv_data, dtype=np.float32)
                uv_interp = pv.GetInterpolation()
                break

    # Handle faceVarying normals — expand to per-vertex per face
    if normals is not None and norm_interp == 'faceVarying':
        # Build expanded per-vertex-per-face arrays
        tri_verts = []
        tri_normals = []
        tri_uvs = [] if uvs is not None else None

        face_vert_idx = 0
        for count in counts:
            face_pts = [pts[indices[face_vert_idx + i]] for i in range(count)]
            face_norms = [normals[face_vert_idx + i] for i in range(count)]
            face_uvs = None
            if uvs is not None and uv_interp == 'faceVarying':
                face_uvs = [uvs[face_vert_idx + i] for i in range(count)]
            elif uvs is not None:
                face_uvs = [uvs[indices[face_vert_idx + i]] for i in range(count)]

            for i in range(1, count - 1):
                for fi in [0, i, i + 1]:
                    tri_verts.append(face_pts[fi])
                    tri_normals.append(face_norms[fi])
                    if tri_uvs is not None:
                        tri_uvs.append(face_uvs[fi] if face_uvs else [0, 0])

            face_vert_idx += count

        verts_np = np.array(tri_verts, dtype=np.float32)
        norms_np = np.array(tri_normals, dtype=np.float32)
        uvs_np = np.array(tri_uvs, dtype=np.float32) if tri_uvs is not None else None
        idx_np = np.arange(len(verts_np), dtype=np.uint32)
    else:
        # vertex or uniform normals
        if normals is not None and len(normals) < len(pts):
            # uniform normals — expand
            normals = np.tile(normals[0], (len(pts), 1)).reshape(-1, 3).astype(np.float32)

        verts_np, idx_np, norms_np, uvs_np = triangulate_mesh(
            pts, indices, counts, normals, uvs
        )

    # Coordinate system: USD is Y-up or Z-up, GLTF is Y-up
    # Isaac Sim uses Z-up. Rotate X by -90° (swap Y/Z, negate new Z)
    # verts: (x, y, z) -> (x, z, -y)
    verts_np = verts_np[:, [0, 2, 1]].copy()
    verts_np[:, 2] *= -1

    if norms_np is not None and len(norms_np) > 0:
        norms_np = norms_np[:, [0, 2, 1]].copy()
        norms_np[:, 2] *= -1

    # Flip UV V coordinate (USD UV origin is bottom-left, GLTF is top-left)
    if uvs_np is not None and len(uvs_np) > 0:
        uvs_np[:, 1] = 1.0 - uvs_np[:, 1]

    return {
        'positions': verts_np,
        'indices': idx_np,
        'normals': norms_np,
        'uvs': uvs_np,
        'path': str(mesh_prim.GetPath()),
    }


# ---------------------------------------------------------------------------
# GLB assembly
# ---------------------------------------------------------------------------

def build_glb(meshes_data: list[dict], textures: dict) -> bytes:
    """
    Build a GLB binary from a list of mesh dicts and a texture map.
    textures: { 'diffuse': (bytes, mime), 'normal': (bytes, mime), ... }
    """
    buf = BinaryBuffer()
    gltf = {
        'asset': {'version': '2.0', 'generator': 'usd_to_glb.py'},
        'scene': 0,
        'scenes': [{'nodes': []}],
        'nodes': [],
        'meshes': [],
        'accessors': [],
        'bufferViews': [],
        'materials': [],
        'textures': [],
        'images': [],
        'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}],
        'buffers': [],
    }

    # Upload textures (only keys that are (bytes, mime_type) tuples)
    SCALAR_KEYS = {'metallic_factor', 'roughness_factor', 'base_color'}
    tex_index = {}
    for tex_key, tex_val in textures.items():
        if tex_key in SCALAR_KEYS:
            continue
        tex_bytes, mime_type = tex_val
        offset, length = buf.add(tex_bytes)
        bv_idx = len(gltf['bufferViews'])
        gltf['bufferViews'].append({
            'buffer': 0,
            'byteOffset': offset,
            'byteLength': length,
        })
        img_idx = len(gltf['images'])
        gltf['images'].append({'bufferView': bv_idx, 'mimeType': mime_type})
        tex_idx = len(gltf['textures'])
        gltf['textures'].append({'sampler': 0, 'source': img_idx})
        tex_index[tex_key] = tex_idx

    # Build material
    mat_def = {
        'name': 'mat',
        'pbrMetallicRoughness': {
            'metallicFactor': textures.get('metallic_factor', 0.0),
            'roughnessFactor': textures.get('roughness_factor', 0.5),
        },
        'doubleSided': True,
    }
    if 'diffuse' in tex_index:
        mat_def['pbrMetallicRoughness']['baseColorTexture'] = {'index': tex_index['diffuse']}
    elif 'base_color' in textures:
        mat_def['pbrMetallicRoughness']['baseColorFactor'] = textures['base_color'] + [1.0]

    # Combine roughness + metallic into ORM texture if both exist as textures
    if 'roughness' in tex_index:
        mat_def['pbrMetallicRoughness']['metallicRoughnessTexture'] = {'index': tex_index['roughness']}
    if 'normal' in tex_index:
        mat_def['normalTexture'] = {'index': tex_index['normal']}
    if 'emissive' in tex_index:
        mat_def['emissiveTexture'] = {'index': tex_index['emissive']}

    mat_idx = len(gltf['materials'])
    gltf['materials'].append(mat_def)

    # Build each mesh
    mesh_nodes = []
    for mi, mdata in enumerate(meshes_data):
        positions = mdata['positions']
        idx = mdata['indices']
        normals = mdata['normals']
        uvs = mdata['uvs']

        primitives = {}

        # Positions
        pos_bytes = positions.astype(np.float32).tobytes()
        offset, length = buf.add(pos_bytes)
        bv_idx = len(gltf['bufferViews'])
        gltf['bufferViews'].append({
            'buffer': 0, 'byteOffset': offset, 'byteLength': length,
            'target': 34962,  # ARRAY_BUFFER
        })
        acc_idx = len(gltf['accessors'])
        gltf['accessors'].append({
            'bufferView': bv_idx, 'byteOffset': 0,
            'componentType': 5126, 'count': len(positions), 'type': 'VEC3',
            'min': positions.min(axis=0).tolist(),
            'max': positions.max(axis=0).tolist(),
        })
        primitives['POSITION'] = acc_idx

        # Indices
        idx32 = idx.astype(np.uint32)
        idx_bytes = idx32.tobytes()
        offset, length = buf.add(idx_bytes)
        bv_idx = len(gltf['bufferViews'])
        gltf['bufferViews'].append({
            'buffer': 0, 'byteOffset': offset, 'byteLength': length,
            'target': 34963,  # ELEMENT_ARRAY_BUFFER
        })
        idx_acc = len(gltf['accessors'])
        gltf['accessors'].append({
            'bufferView': bv_idx, 'byteOffset': 0,
            'componentType': 5125, 'count': len(idx32), 'type': 'SCALAR',
        })

        # Normals
        if normals is not None and len(normals) == len(positions):
            norm_bytes = normals.astype(np.float32).tobytes()
            offset, length = buf.add(norm_bytes)
            bv_idx = len(gltf['bufferViews'])
            gltf['bufferViews'].append({
                'buffer': 0, 'byteOffset': offset, 'byteLength': length,
                'target': 34962,
            })
            norm_acc = len(gltf['accessors'])
            gltf['accessors'].append({
                'bufferView': bv_idx, 'byteOffset': 0,
                'componentType': 5126, 'count': len(normals), 'type': 'VEC3',
            })
            primitives['NORMAL'] = norm_acc

        # UVs
        if uvs is not None and len(uvs) == len(positions):
            uv_bytes = uvs.astype(np.float32).tobytes()
            offset, length = buf.add(uv_bytes)
            bv_idx = len(gltf['bufferViews'])
            gltf['bufferViews'].append({
                'buffer': 0, 'byteOffset': offset, 'byteLength': length,
                'target': 34962,
            })
            uv_acc = len(gltf['accessors'])
            gltf['accessors'].append({
                'bufferView': bv_idx, 'byteOffset': 0,
                'componentType': 5126, 'count': len(uvs), 'type': 'VEC2',
            })
            primitives['TEXCOORD_0'] = uv_acc

        mesh_name = mdata['path'].replace('/', '_').strip('_')
        mesh_def = {
            'name': mesh_name,
            'primitives': [{
                'attributes': primitives,
                'indices': idx_acc,
                'material': mat_idx,
            }]
        }
        mesh_idx = len(gltf['meshes'])
        gltf['meshes'].append(mesh_def)

        node_idx = len(gltf['nodes'])
        gltf['nodes'].append({'mesh': mesh_idx, 'name': mesh_name})
        mesh_nodes.append(node_idx)

    gltf['scenes'][0]['nodes'] = mesh_nodes

    # Buffer entry (placeholder — byteLength set after assembly)
    bin_data = buf.data
    gltf['buffers'].append({'byteLength': len(bin_data)})

    # Remove empty arrays
    for key in ['textures', 'images', 'samplers']:
        if key in gltf and not gltf[key]:
            del gltf[key]

    # Serialise JSON chunk
    json_str = json.dumps(gltf, separators=(',', ':'))
    json_bytes = json_str.encode('utf-8')
    # Pad JSON to 4 bytes with spaces
    json_pad = (4 - len(json_bytes) % 4) % 4
    json_bytes += b' ' * json_pad

    # GLB header: magic, version, total length
    # Chunk 0: JSON
    json_chunk = struct.pack('<II', len(json_bytes), 0x4E4F534A) + json_bytes
    # Chunk 1: BIN
    bin_chunk = struct.pack('<II', len(bin_data), 0x004E4942) + bin_data

    total_len = 12 + len(json_chunk) + len(bin_chunk)
    header = struct.pack('<III', 0x46546C67, 2, total_len)

    return header + json_chunk + bin_chunk


# ---------------------------------------------------------------------------
# Main conversion function
# ---------------------------------------------------------------------------

def convert_usd_to_glb(input_path: str, output_path: str) -> bool:
    """Convert a USD file to GLB. Returns True on success."""
    input_path = str(Path(input_path).resolve())
    output_path = str(Path(output_path).resolve())
    usd_dir = str(Path(input_path).parent)

    print(f"Converting: {input_path}")
    print(f"       To: {output_path}")

    try:
        stage = Usd.Stage.Open(input_path)
    except Exception as e:
        print(f"  ERROR opening USD: {e}")
        return False

    # Extract all meshes — also traverse instance prototypes for instanceable assets
    meshes_data = []
    material_info = {}

    def collect_meshes(traverse_root):
        """Collect meshes from a traversal root (stage or prototype)."""
        for prim in traverse_root:
            if prim.IsA(UsdGeom.Mesh):
                mdata = extract_mesh_data(prim)
                if mdata:
                    meshes_data.append(mdata)
                    if not material_info:
                        mat = get_material_for_mesh(prim, usd_dir)
                        if mat:
                            material_info.update(mat)

    collect_meshes(stage.Traverse())

    # If no meshes found yet, look inside USD instance prototypes
    if not meshes_data:
        for proto in stage.GetPrototypes():
            collect_meshes(proto.GetAllChildren())
            collect_meshes(Usd.PrimRange(proto))

    if not meshes_data:
        print("  ERROR: No mesh data extracted")
        return False

    total_verts = sum(len(m['positions']) for m in meshes_data)
    print(f"  Extracted {len(meshes_data)} mesh(es), {total_verts:,} vertices total")

    # Load textures
    textures = {}
    for tex_key in ['diffuse', 'normal', 'roughness', 'metallic', 'emissive']:
        if tex_key in material_info:
            result = load_texture_bytes(material_info[tex_key])
            if result:
                textures[tex_key] = result
                print(f"  Loaded texture [{tex_key}]: {material_info[tex_key]}")

    # Carry through scalar material properties
    for key in ['metallic_factor', 'roughness_factor', 'base_color']:
        if key in material_info:
            textures[key] = material_info[key]

    if not textures:
        print("  WARNING: No textures found — model will render with default grey material")

    # Build GLB
    glb_bytes = build_glb(meshes_data, textures)

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'wb') as f:
        f.write(glb_bytes)

    size_kb = len(glb_bytes) / 1024
    print(f"  Written: {output_path} ({size_kb:.1f} KB)")
    return True


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description='Convert Isaac Sim USD assets to GLB for Three.js'
    )
    parser.add_argument('input', help='Input USD file or directory (with --batch)')
    parser.add_argument('output', help='Output GLB file or directory (with --batch)')
    parser.add_argument('--batch', action='store_true',
                        help='Batch convert all .usd files in input directory')
    args = parser.parse_args()

    if args.batch:
        input_dir = Path(args.input)
        output_dir = Path(args.output)
        usd_files = list(input_dir.glob('*.usd'))
        usd_files = [f for f in usd_files if not f.name.startswith('.')]
        print(f"Batch converting {len(usd_files)} USD files from {input_dir}")
        success = 0
        for usd_file in sorted(usd_files):
            out_file = output_dir / (usd_file.stem + '.glb')
            if convert_usd_to_glb(str(usd_file), str(out_file)):
                success += 1
        print(f"\nDone: {success}/{len(usd_files)} converted successfully")
    else:
        ok = convert_usd_to_glb(args.input, args.output)
        sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
