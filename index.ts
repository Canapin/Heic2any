/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { findLazy } from "@webpack";
import heic2any from "heic2any";

const settings = definePluginSettings({
    convertOnUpload: {
        description: "Convert HEIC/HEIF images to JPEG when uploading",
        type: OptionType.BOOLEAN,
        default: true,
    }
});

const HEIC_MIME_TYPES = new Set([
    "image/heic",
    "image/heif",
    "image/heic-sequence",
    "image/heif-sequence"
]);

const HEIC_EXTS = new Set([".heic", ".heif", ".heics", ".heifs"]);

function isHeic(mimeType: string, filename: string) {
    if (HEIC_MIME_TYPES.has(mimeType)) return true;
    const dot = filename.lastIndexOf(".");
    return dot !== -1 && HEIC_EXTS.has(filename.slice(dot).toLowerCase());
}

async function convert(upload: any) {
    if (!isHeic(upload.mimeType, upload.filename)) return;

    try {
        const result = await heic2any({
            blob: upload.item.file,
            toType: "image/jpeg",
        });

        const jpegBlob = Array.isArray(result) ? result[0] : result;
        const newName = upload.filename.replace(/\.(heic|heif|heics|heifs)$/i, ".jpg");
        const jpegFile = new File([jpegBlob], newName, { type: "image/jpeg" });

        upload.item.file = jpegFile;
        upload.filename = newName;
        upload.mimeType = "image/jpeg";
    } catch (e) {
        console.error("[HeicToJpeg] Failed to convert", upload.filename, e);
    }
}

let unpatch: (() => void) | null = null;

export default definePlugin({
    name: "HeicToJpeg",
    description: "Converts HEIC/HEIF images to JPEG on upload",
    authors: [Devs.Ven],
    settings,

    start() {
        try {
            const CloudUpload = findLazy(m =>
                m.prototype?.trackUploadFinished
            ) as any;

            if (!CloudUpload?.prototype?.upload) {
                console.warn("[HeicToJpeg] CloudUpload class not found");
                return;
            }

            const orig = CloudUpload.prototype.upload;

            CloudUpload.prototype.upload = async function (...args: any[]) {
                if (settings.store.convertOnUpload)
                    await convert(this);
                return orig.apply(this, args);
            };

            unpatch = () => {
                CloudUpload.prototype.upload = orig;
            };
        } catch (e) {
            console.warn("[HeicToJpeg] Failed to patch CloudUpload", e);
        }
    },

    stop() {
        unpatch?.();
        unpatch = null;
    },
});
