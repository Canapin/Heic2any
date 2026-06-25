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
import { FluxDispatcher, showToast, Toasts } from "@webpack/common";
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

async function convertItems(items: any[]): Promise<any[]> {
    return Promise.all(items.map(async item => {
        const file = item?.file ?? item;
        if (!(file instanceof File) || !isHeic(file.type, file.name)) return item;

        try {
            const result = await heic2any({ blob: file, toType: "image/jpeg" });
            const jpegBlob = Array.isArray(result) ? result[0] : result;
            const newName = file.name.replace(/\.(heic|heif|heics|heifs)$/i, ".jpg");
            const newFile = new File([jpegBlob], newName, { type: "image/jpeg" });
            return item instanceof File ? newFile : { ...item, file: newFile };
        } catch (e) {
            console.error("[HeicToJpeg] Failed to convert", file.name, e);
            return item;
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
                    const heic: any[] = [];
                    const other: any[] = [];
                    for (const f of action.files) {
                        const file = f?.file ?? f;
                        if (!(file instanceof File)) { other.push(f); continue; }
                        (isHeic(file.type, file.name) ? heic : other).push(f);
                    }
                    if (other.length) origDispatch!({ ...action, files: other });
                    if (heic.length) {
                        const count = heic.length;
                        const msg = `Converting ${count} HEIC file${count > 1 ? "s" : ""} to JPEG\u2026`;
                        const opts = { position: Toasts.Position.BOTTOM };
                        showToast(msg, Toasts.Type.MESSAGE, opts);
                        let done = false;
                        setTimeout(() => {
                            if (!done) showToast(msg, Toasts.Type.MESSAGE, opts);
                        }, 4000);
                        convertItems(heic).then(converted => {
                            done = true;
                            origDispatch!({ ...action, files: converted });
                        }, () => {
                            done = true;
                            showToast("HEIC conversion failed", Toasts.Type.FAILURE, opts);
                            origDispatch!({ ...action, files: heic });
                        });
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
