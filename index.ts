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
let converting = false;
let queueItems: any[] = [];
let queueAction: any = null;

function doConvert(items: any[], action: any) {
    const count = items.length;
    const names = items.map((i: any) => (i?.file ?? i).name);
    console.log("[HeicToJpeg:D] doConvert start count:", count, "names:", names);
    const msg = `Converting ${count} HEIC file${count > 1 ? "s" : ""} to JPEG\u2026`;
    const opts = { position: Toasts.Position.BOTTOM };
    showToast(msg, Toasts.Type.MESSAGE, opts);

    convertItems(items).then(converted => {
        console.log("[HeicToJpeg:D] doConvert done, converted:", converted.map((c: any) => (c?.file ?? c).name));
        converting = false;
        origDispatch!({ ...action, files: converted });
        drainQueue();
    }, () => {
        console.log("[HeicToJpeg:D] doConvert failed");
        converting = false;
        showToast("HEIC conversion failed", Toasts.Type.FAILURE, opts);
        origDispatch!({ ...action, files: items });
        drainQueue();
    });
}

function drainQueue() {
    if (!queueItems.length) return console.log("[HeicToJpeg:D] drainQueue nothing queued");
    console.log("[HeicToJpeg:D] drainQueue processing", queueItems.length, "queued items");
    const items = queueItems;
    const action = queueAction;
    queueItems = [];
    queueAction = null;
    converting = true;
    doConvert(items, action);
}

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
                    console.log("[HeicToJpeg:D] dispatch caught, files:", action.files.length);
                    const heic: any[] = [];
                    const other: any[] = [];
                    for (const f of action.files) {
                        const file = f?.file ?? f;
                        const isFile = file instanceof File;
                        console.log("[HeicToJpeg:D]   item", isFile ? `File name="${file.name}" type="${file.type}"` : typeof file, "isHeic:", isFile && isHeic(file.type, file.name));
                        if (!isFile) { other.push(f); continue; }
                        (isHeic(file.type, file.name) ? heic : other).push(f);
                    }
                    console.log("[HeicToJpeg:D]   -> heic:", heic.length, "other:", other.length, "converting flag:", converting);
                    if (other.length) origDispatch!({ ...action, files: other });
                    if (heic.length) {
                        if (converting) {
                            console.log("[HeicToJpeg:D]   -> queuing, queueItems now:", queueItems.length + heic.length);
                            queueItems.push(...heic);
                            queueAction ??= action;
                        } else {
                            console.log("[HeicToJpeg:D]   -> starting conversion, names:", heic.map((h: any) => (h?.file ?? h).name));
                            converting = true;
                            doConvert(heic, action);
                        }
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
