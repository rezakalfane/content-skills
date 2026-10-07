"""Upload local files to Amplience DAM (the configured asset folder) via the GraphQL Asset Management API."""
import base64
import mimetypes
from pathlib import Path

from amp import ASSET_FOLDER, ASSET_REPO, call, gql


def _raw_id(global_id):
    """GraphQL node ids are base64 `Type:uuid`."""
    try:
        return base64.b64decode(global_id).decode().split(":", 1)[1]
    except Exception:
        return global_id


UPSERT = """mutation($i: CreateUpdateAssetInput!){ createOrUpdateAssetByName(input:$i){ id } }"""
PUBLISH = """mutation($i: PublishAssetInput!){ publishAsset(input:$i){ publishJobId } }"""
GET = """query($id: ID!){ node(id:$id){ ... on Asset { id assetId name filename published status } } }"""


def upload(path, name, publish=True):
    """Upload `path` as an image asset called `name` (idempotent: same name updates). Returns the asset node."""
    path = Path(path)
    tmp = gql("mutation { createTempFileUploadUrl { uploadUrl downloadUrl } }")["createTempFileUploadUrl"]
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    call("PUT", tmp["uploadUrl"], raw=path.read_bytes(), headers={"Content-Type": mime, "Authorization": ""})
    inp = {
        "src": tmp["downloadUrl"],
        "type": "IMAGE",
        "name": name,
        "filename": path.name,
        "assetRepositoryId": ASSET_REPO,
        "assetFolderId": ASSET_FOLDER,
    }
    gid = gql(UPSERT, {"i": inp})["createOrUpdateAssetByName"]["id"]
    if publish:
        gql(PUBLISH, {"i": {"id": gid}})
    return gql(GET, {"id": gid})["node"]
