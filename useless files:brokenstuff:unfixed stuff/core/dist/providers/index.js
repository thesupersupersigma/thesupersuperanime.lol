"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.providers = void 0;
exports.getRacedSources = getRacedSources;
const gogoanime_1 = require("./gogoanime");
const aniwave_1 = require("./aniwave");
exports.providers = [
    new gogoanime_1.GogoAnimeProvider(),
    new aniwave_1.AniWaveProvider(),
];
/**
 * Race all providers — return first successful result.
 * Uses Promise.any so the fastest provider that returns
 * valid sources wins. All others are abandoned.
 *
 * If ALL providers fail, Promise.any rejects with AggregateError.
 */
async function getRacedSources(animeTitle, episodeNum) {
    return Promise.any(exports.providers.map(async (p) => {
        const id = await p.findEpisodeId(animeTitle, episodeNum);
        if (!id)
            throw new Error(`[${p.id}] Episode not found`);
        const result = await p.getSources(id);
        if (result.sources.length === 0)
            throw new Error(`[${p.id}] No sources extracted`);
        return result;
    }));
}
//# sourceMappingURL=index.js.map