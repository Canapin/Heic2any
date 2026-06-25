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
import { FluxDispatcher } from "@webpack/common";
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

async function convertFiles(files: File[]): Promise<File[]> {
    return Promise.all(files.map(async f => {
        if (!isHeic(f.type, f.name)) return f;

        try {
            const result = await heic2any({ blob: f, toType: "image/jpeg" });
            const jpegBlob = Array.isArray(result) ? result[0] : result;
            const newName = f.name.replace(/\.(heic|heif|heics|heifs)$/i, ".jpg");
            return new File([jpegBlob], newName, { type: "image/jpeg" });
        } catch (e) {
            console.error("[HeicToJpeg] Failed to convert", f.name, e);
            return f;
        }
    }));
}

const UPLOAD = "UPLOAD_ATTACHMENT_ADD_FILES";
let origDispatch: ((action: any) => void) | null = null;

export default definePlugin({
    name: "HeicToJpeg",
    description: "Converts HEIC/HEIF images to JPEG on upload",
    authors: [Devs.Ven],
    settings,

    start() {
        try {
            origDispatch = FluxDispatcher.dispatch.bind(FluxDispatcher);

            FluxDispatcher.dispatch = function (action: any) {
                if (
                    settings.store.convertOnUpload &&
                    action.type === UPLOAD &&
                    action.files?.length
                ) {
                    const heic: File[] = [];
                    const other: File[] = [];
                    for (const f of action.files) {
                        (isHeic(f.type, f.name) ? heic : other).push(f);
                    }
                    if (other.length) origDispatch!({ ...action, files: other });
                    if (heic.length) {
                        convertFiles(heic).then(converted =>
                            origDispatch!({ ...action, files: converted })
                        );
                    }
                    return;
                }
                return origDispatch!(action);
            };
        } catch (e) {
            console.warn("[HeicToJpeg] Failed to intercept dispatch", e);
        }
    },

    stop() {
        if (origDispatch) {
            FluxDispatcher.dispatch = origDispatch;
            origDispatch = null;
        }
    },
});
