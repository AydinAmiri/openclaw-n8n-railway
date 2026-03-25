import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";

// ---------------------------------------------------------------------------
// Optimization recommendations — queryable by OpenClaw or Agent Ops Center
// ---------------------------------------------------------------------------

/**
 * Record an optimization recommendation from analysis.
 * Can be triggered by cron jobs, manual analysis, or compound learning loops.
 */
export const record = mutation({
  args: {
    category: v.union(
      v.literal("model"),
      v.literal("cron"),
      v.literal("convex"),
      v.literal("temporal"),
      v.literal("cost"),
      v.literal("integration"),
      v.literal("upgrade"),
    ),
    priority: v.union(
      v.literal("critical"),
      v.literal("high"),
      v.literal("medium"),
      v.literal("low"),
    ),
    title: v.string(),
    description: v.string(),
    estimatedSavings: v.optional(v.string()),
    effort: v.optional(v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
    )),
    status: v.optional(v.union(
      v.literal("proposed"),
      v.literal("approved"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("rejected"),
    )),
    actionItems: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("optimizations", {
      ...args,
      status: args.status ?? "proposed",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

/**
 * Update the status of an optimization (approve, start, complete, reject).
 */
export const updateStatus = mutation({
  args: {
    id: v.id("optimizations"),
    status: v.union(
      v.literal("proposed"),
      v.literal("approved"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("rejected"),
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: args.status,
      updatedAt: Date.now(),
      ...(args.notes ? { notes: args.notes } : {}),
    });
  },
});

/**
 * List optimizations by category or priority.
 */
export const list = query({
  args: {
    category: v.optional(v.union(
      v.literal("model"),
      v.literal("cron"),
      v.literal("convex"),
      v.literal("temporal"),
      v.literal("cost"),
      v.literal("integration"),
      v.literal("upgrade"),
    )),
    status: v.optional(v.union(
      v.literal("proposed"),
      v.literal("approved"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("rejected"),
    )),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let q = ctx.db.query("optimizations").order("desc");
    const results = await q.take(args.limit ?? 50);
    return results.filter((r: any) => {
      if (args.category && r.category !== args.category) return false;
      if (args.status && r.status !== args.status) return false;
      return true;
    });
  },
});

/**
 * Get a summary of optimization status counts.
 */
export const summary = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("optimizations").collect();
    const counts: Record<string, number> = {};
    for (const o of all) {
      const s = (o as any).status ?? "proposed";
      counts[s] = (counts[s] ?? 0) + 1;
    }
    const totalSavings = all
      .filter((o: any) => o.estimatedSavings && o.status !== "rejected")
      .map((o: any) => o.estimatedSavings)
      .join(", ");
    return { total: all.length, byStatus: counts, estimatedSavings: totalSavings };
  },
});

// ---------------------------------------------------------------------------
// Compound learning loop — auto-optimize model assignments
// ---------------------------------------------------------------------------

/**
 * Analyze model performance and recommend reassignments.
 * Called by Temporal workflow or cron job weekly.
 */
export const analyzeModelPerformance = query({
  args: {},
  handler: async (ctx) => {
    const perf = await ctx.db.query("modelPerformance").order("desc").take(100);
    if (perf.length === 0) {
      return { recommendations: [], message: "No performance data yet" };
    }

    // Group by task type, find best model per type
    const byTask: Record<string, Array<{ model: string; avgDuration: number; cost: number; successRate: number }>> = {};
    for (const p of perf) {
      const entry = p as any;
      const task = entry.taskType ?? "unknown";
      if (!byTask[task]) byTask[task] = [];
      byTask[task].push({
        model: entry.model ?? "unknown",
        avgDuration: entry.avgDurationMs ?? 0,
        cost: entry.totalCost ?? 0,
        successRate: entry.successRate ?? 0,
      });
    }

    const recommendations = [];
    for (const [task, models] of Object.entries(byTask)) {
      // Sort by success rate desc, then cost asc
      const sorted = models.sort((a, b) =>
        b.successRate - a.successRate || a.cost - b.cost
      );
      if (sorted.length > 1) {
        recommendations.push({
          taskType: task,
          currentBest: sorted[0].model,
          alternatives: sorted.slice(1, 3).map(m => ({
            model: m.model,
            successRate: m.successRate,
            costDelta: m.cost - sorted[0].cost,
          })),
        });
      }
    }

    return { recommendations, analyzed: perf.length };
  },
});

// ---------------------------------------------------------------------------
// Service mesh health — aggregate check across all services
// ---------------------------------------------------------------------------

/**
 * Get overall mesh health status from serviceHeartbeats.
 */
export const meshHealth = query({
  args: {},
  handler: async (ctx) => {
    const heartbeats = await ctx.db.query("serviceHeartbeats").collect();
    const services: Record<string, { status: string; lastSeen: number }> = {};
    for (const hb of heartbeats) {
      const entry = hb as any;
      services[entry.serviceId ?? "unknown"] = {
        status: entry.status ?? "unknown",
        lastSeen: entry.lastSeen ?? entry._creationTime,
      };
    }
    const healthy = Object.values(services).filter(s => s.status === "healthy").length;
    const total = Object.keys(services).length;
    return {
      healthy,
      total,
      allHealthy: healthy === total,
      services,
    };
  },
});
