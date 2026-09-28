package ch.bfh.timeweaver.domain;

import java.util.Objects;

import ai.timefold.solver.core.api.domain.common.PlanningId;

/**
 * On-Campus-Tag (Kap. domain.model): Campus-Blöcke
 * eines Semesters — Planungswert des Solvers.
 */
public class OnCampusDay {

    @PlanningId
    private String id;
    /** ISO-Datum YYYY-MM-DD */
    private String date;
    private int week;
    private String weekday;
    /** "main" | "final" */
    private String phase;

    public OnCampusDay() {
    }

    public OnCampusDay(String id, String date, int week, String weekday, String phase) {
        this.id = id;
        this.date = date;
        this.week = week;
        this.weekday = weekday;
        this.phase = phase;
    }

    public String getId() {
        return id;
    }

    public String getDate() {
        return date;
    }

    public int getWeek() {
        return week;
    }

    public String getWeekday() {
        return weekday;
    }

    public String getPhase() {
        return phase;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof OnCampusDay)) return false;
        return id != null && id.equals(((OnCampusDay) o).id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }

    @Override
    public String toString() {
        return "OnCampusDay[" + id + " " + date + "]";
    }
}
