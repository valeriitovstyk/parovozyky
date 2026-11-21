// Dumps all constant game tables of reSL (src/game/resources/*.cpp) as JSON.
// The same values are folded into an FNV-1a hash (over int32 words, in output
// order) which the TS test compares with the generated data (test T1).
//
// usage: dump_tables > tables.json   (the hash goes to stderr as "hash <hex>")

#include <game/entrance.h>
#include <game/resources/allowed_cursor_rail_types.h>
#include <game/resources/carriage_bias.h>
#include <game/resources/chunk_bounding_boxes.h>
#include <game/resources/dispatcher_glyph.h>
#include <game/resources/entrance_rails.h>
#include <game/resources/glyph_empty_background.h>
#include <game/resources/impasse_glyph.h>
#include <game/resources/movement_paths.h>
#include <game/resources/rail_connection_bias.h>
#include <game/resources/rail_connection_rule.h>
#include <game/resources/rail_glyph.h>
#include <game/resources/rail_type_meta.h>
#include <game/resources/semaphore_glyph.h>
#include <game/resources/semaphore_glyph_bias.h>
#include <game/resources/small_font.h>
#include <game/resources/static_object_glyph.h>
#include <game/resources/text_glyphs.h>
#include <game/resources/train_finished_exclamation_glyph.h>
#include <game/resources/train_glyph.h>
#include <game/resources/train_specification.h>
#include <graphics/glyph.h>

#include <cstdint>
#include <cstdio>
#include <string>

using namespace resl;

namespace {

std::uint32_t g_hash = 2166136261u;
std::string g_out;
bool g_needComma = false;

void num(long v)
{
    if (g_needComma)
        g_out += ',';
    g_out += std::to_string(v);
    g_needComma = true;
    g_hash = (g_hash ^ static_cast<std::uint32_t>(static_cast<std::int32_t>(v))) * 16777619u;
}

void open(char c)
{
    if (g_needComma)
        g_out += ',';
    g_out += c;
    g_needComma = false;
}

void close(char c)
{
    g_out += c;
    g_needComma = true;
}

void key(const char* k)
{
    if (g_needComma)
        g_out += ',';
    g_out += '"';
    g_out += k;
    g_out += "\":";
    g_needComma = false;
    // keys are part of the hash too (their bytes), so that a renamed table is noticed
    for (const char* p = k; *p; ++p)
        g_hash = (g_hash ^ static_cast<std::uint8_t>(*p)) * 16777619u;
}

void bytes(const std::uint8_t* p, std::size_t n)
{
    open('[');
    for (std::size_t i = 0; i < n; ++i)
        num(p[i]);
    close(']');
}

// Glyph: [width (bytes), height, ...data]
void glyph(const Glyph& g)
{
    open('[');
    num(g.width);
    num(g.height);
    for (int i = 0; i < g.width * g.height; ++i)
        num(g.data[i]);
    close(']');
}

// RailGlyph: [dx, dy, width, height, ...data]
void railGlyph(const RailGlyph* rg)
{
    if (!rg) {
        open('[');
        close(']');
        return;
    }
    open('[');
    num(rg->dx);
    num(rg->dy);
    num(rg->glyph.width);
    num(rg->glyph.height);
    for (int i = 0; i < rg->glyph.width * rg->glyph.height; ++i)
        num(rg->glyph.data[i]);
    close(']');
}

} // namespace

int main()
{
    open('{');

    key("allowedRailCursorTypes"); // [tileX][tileY] flattened x*11+y
    bytes(&g_allowedRailCursorTypes[0][0], 121);

    key("carriageYBiases"); // [type][angle] flattened
    open('[');
    for (const auto& row : g_carriageYBiases)
        for (std::int8_t v : row)
            num(v);
    close(']');

    key("chunkBoundingBoxes"); // 6 x [x1, y1, x2, y2]
    open('[');
    for (const Rectangle& r : g_chunkBoundingBoxes) {
        open('[');
        num(r.x1);
        num(r.y1);
        num(r.x2);
        num(r.y2);
        close(']');
    }
    close(']');

    key("entranceRails"); // 46 x [roadTypeMask, tileX, tileY, railType, year_8]
    open('[');
    for (const RailInfo& ri : g_entranceRails) {
        open('[');
        num(ri.roadTypeMask);
        num(ri.tileX);
        num(ri.tileY);
        num(ri.railType);
        num(ri.year_8);
        close(']');
    }
    close(']');

    key("entranceColors"); // initial g_entrances: 9 x [bgColor, fgColor]
    open('[');
    for (const Entrance& e : g_entrances) {
        open('[');
        num(e.bgColor);
        num(e.fgColor);
        close(']');
    }
    close(']');

    key("movementPaths"); // 7 x [size, dx0, dy0, angle0, dx1, ...] (size steps)
    open('[');
    for (const Path& p : g_movementPaths) {
        open('[');
        num(p.size);
        constexpr int capacity = static_cast<int>(sizeof(p.data) / sizeof(p.data[0]));
        for (int i = 0; i < p.size; ++i) {
            // reSL: path 6 has 255 steps but data[235] (empty); the oracle (P7)
            // and the port extend it with zeros
            const PathStep s = i < capacity ? p.data[i] : PathStep { 0, 0, 0 };
            num(s.dx);
            num(s.dy);
            num(s.angle);
        }
        close(']');
    }
    close(']');

    key("railConnectionBiases"); // [railType][side] -> [tileOffsetX, tileOffsetY, unknown1]
    open('[');
    for (const auto& row : g_railConnectionBiases)
        for (const RailConnectionBias& b : row) {
            open('[');
            num(b.tileOffsetX);
            num(b.tileOffsetY);
            num(b.unknown1);
            close(']');
        }
    close(']');

    key("railConnectionRules"); // [railType][i] -> [railType, tileDX, tileDY, slot1, slot2]
    open('[');
    for (const auto& row : g_railConnectionRules)
        for (const RailConnectionRule& r : row) {
            open('[');
            num(r.railType);
            num(r.tileDX);
            num(r.tileDY);
            num(r.slot1);
            num(r.slot2);
            close(']');
        }
    close(']');

    key("railTypeMeta"); // 12 x [tileOffsetX, tileOffsetY, railType, semaphoreType]
    open('[');
    for (const RailTypeMeta& m : g_railTypeMeta) {
        open('[');
        num(m.tileOffsetX);
        num(m.tileOffsetY);
        num(m.railType);
        num(static_cast<int>(m.semaphoreType));
        close(']');
    }
    close(']');

    key("semaphoreGlyphBiases"); // [railType][direction] -> [dx, dy]
    open('[');
    for (const auto& row : g_semaphoreGlyphBiases)
        for (const SemaphoreGlyphBias& b : row) {
            open('[');
            num(b.dx);
            num(b.dy);
            close(']');
        }
    close(']');

    key("trainSpecifications"); // 14 x [minYear, maxYear, maxSpeed, c0..c4]
    open('[');
    for (const TrainSpecification& s : g_trainSpecifications) {
        open('[');
        num(s.minYear);
        num(s.maxYear);
        num(s.maxSpeed);
        for (CarriageType c : s.possibleCarriages)
            num(static_cast<int>(c));
        close(']');
    }
    close(']');

    key("trainGlyphSizes"); // [type][angle][direction] -> [width, height]
    open('[');
    for (const auto& a : g_trainGlyphs)
        for (const auto& b : a)
            for (const TrainGlyph& g : b) {
                open('[');
                num(g.width);
                num(g.height);
                close(']');
            }
    close(']');

    key("textGlyphs"); // 147 x [yOffset, height, width, ...data (height rows, 1 or 2 bytes per row)]
    open('[');
    for (const TextGlyph& g : g_textGlyphs) {
        open('[');
        num(g.yOffset);
        num(g.height);
        num(g.width);
        const int rowBytes = g.width <= 8 ? 1 : 2;
        for (int i = 0; i < g.height * rowBytes; ++i)
            num(g.glyph[i]);
        close(']');
    }
    close(']');

    // ---- bitmaps (presentation only) ----

    key("trainGlyphs"); // [type][angle][direction] -> [glyph1, glyph2, glyph3]
    open('[');
    for (const auto& a : g_trainGlyphs)
        for (const auto& b : a)
            for (const TrainGlyph& g : b) {
                open('[');
                glyph(g.glyph1);
                glyph(g.glyph2);
                glyph(g.glyph3);
                close(']');
            }
    close(']');

    key("railGlyphs"); // 6 x [main, bg2, bg1, switchLeft, switchRight]
    open('[');
    for (const RailTexture& t : railBackgrounds) {
        open('[');
        railGlyph(t.mainGlyph);
        railGlyph(t.bg2);
        railGlyph(t.bg1);
        railGlyph(t.switches[0]);
        railGlyph(t.switches[1]);
        close(']');
    }
    close(']');

    key("semaphoreGlyphs"); // [2][2] -> [xOffset, yOffset, lightXOffset, lightYOffset, bg2[15], bg1[15], light[8]]
    open('[');
    for (const auto& row : g_semaphoreGlyphs)
        for (const SemaphoreGlyph& g : row) {
            open('[');
            num(g.xOffset);
            num(g.yOffset);
            num(g.lightXOffset);
            num(g.lightYOffset);
            for (std::uint8_t v : g.glyphBg2)
                num(v);
            for (std::uint8_t v : g.glyphBg1)
                num(v);
            for (std::uint8_t v : g.glyphLight)
                num(v);
            close(']');
        }
    close(']');

    key("dispatcherGlyphs"); // 2 x [fg[32], bg[32]]
    open('[');
    for (const DispatcherGlyph& g : g_dispatcherGlyphs) {
        open('[');
        for (std::uint8_t v : g.fg)
            num(v);
        for (std::uint8_t v : g.bg)
            num(v);
        close(']');
    }
    close(']');

    key("impasseGlyphs"); // 2 x [fg[16], bg[16]]
    open('[');
    for (const ImpasseGlyph& g : g_impasseGlyphs) {
        open('[');
        for (std::uint8_t v : g.fg)
            num(v);
        for (std::uint8_t v : g.bg)
            num(v);
        close(']');
    }
    close(']');

    key("houseGlyphs"); // 5 x [fg[32], bg[32]]
    open('[');
    for (const StaticObjectGlyph& g : g_houseGlyphs) {
        open('[');
        for (std::uint8_t v : g.fg)
            num(v);
        for (std::uint8_t v : g.bg)
            num(v);
        close(']');
    }
    close(']');

    key("treeGlyphs"); // 4 x [fg[32], bg[32]]
    open('[');
    for (const StaticObjectGlyph& g : g_treeGlyphs) {
        open('[');
        for (std::uint8_t v : g.fg)
            num(v);
        for (std::uint8_t v : g.bg)
            num(v);
        close(']');
    }
    close(']');

    key("glyphEmptyBackground");
    bytes(g_glyphEmptyBackground, 32);

    key("trainFinishedGlyphs"); // [left, right]
    open('[');
    glyph(g_glyphTrainFinishedLeftEntrance);
    glyph(g_glyphTrainFinishedRightEntrance);
    close(']');

    key("font14"); // 256 chars x 14 rows
    bytes(g_font14Data, 256 * 14);

    close('}');
    std::fwrite(g_out.data(), 1, g_out.size(), stdout);
    std::fputc('\n', stdout);
    std::fprintf(stderr, "hash %08x\n", g_hash);
    return 0;
}
