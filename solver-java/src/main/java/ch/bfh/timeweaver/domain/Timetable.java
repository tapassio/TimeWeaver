package ch.bfh.timeweaver.domain;

import java.util.List;

import ai.timefold.solver.core.api.domain.solution.PlanningEntityCollectionProperty;
import ai.timefold.solver.core.api.domain.solution.PlanningScore;
import ai.timefold.solver.core.api.domain.solution.PlanningSolution;
import ai.timefold.solver.core.api.domain.solution.ProblemFactCollectionProperty;
import ai.timefold.solver.core.api.domain.valuerange.ValueRangeProvider;
import ai.timefold.solver.core.api.score.HardSoftScore;

@PlanningSolution
public class Timetable {

    private List<PlanningSession> sessions;
    private List<OnCampusDay> days;
    private List<Room> rooms;

    private HardSoftScore score;

    public Timetable() {
    }

    public Timetable(List<OnCampusDay> days, List<Room> rooms, List<PlanningSession> sessions) {
        this.days = days;
        this.rooms = rooms;
        this.sessions = sessions;
    }

    @PlanningEntityCollectionProperty
    public List<PlanningSession> getSessions() {
        return sessions;
    }

    public void setSessions(List<PlanningSession> sessions) {
        this.sessions = sessions;
    }

    @ProblemFactCollectionProperty
    @ValueRangeProvider
    public List<OnCampusDay> getDays() {
        return days;
    }

    public void setDays(List<OnCampusDay> days) {
        this.days = days;
    }

    @ProblemFactCollectionProperty
    @ValueRangeProvider
    public List<Room> getRooms() {
        return rooms;
    }

    public void setRooms(List<Room> rooms) {
        this.rooms = rooms;
    }

    @PlanningScore
    public HardSoftScore getScore() {
        return score;
    }

    public void setScore(HardSoftScore score) {
        this.score = score;
    }
}
