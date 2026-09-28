package ch.bfh.timeweaver.rest;

import ch.bfh.timeweaver.domain.OnCampusDay;
import ch.bfh.timeweaver.domain.PlanningSession;
import ch.bfh.timeweaver.domain.Room;
import ch.bfh.timeweaver.domain.SoftPenalty;
import ch.bfh.timeweaver.domain.Timetable;

import java.util.ArrayList;
import java.util.List;

/**
 * Payload-Formen für POST /api/solve — Spiegelbild von
 * SolverInput.ts (server/solver/solverInput.ts) und types.ts Stufe 3.
 */
public class SolveApi {

    /** Spiegel von SolverSession / SolverInput. */
    public static class Request {
        public List<SessionDef> sessions = new ArrayList<>();
        public List<DayDef> days = new ArrayList<>();
        public List<RoomDef> rooms = new ArrayList<>();
        public List<PrereqDef> prerequisites = new ArrayList<>();
        public BalanceDef weeklyBalance = new BalanceDef();
        public SolverOptions options = new SolverOptions();
    }

    public static class SessionDef {
        public String id;
        public String moduleId;
        public String moduleName;
        public String program;
        public Integer semester;
        public List<String> slotTypes = new ArrayList<>();
        public int expectedStudents;
        public List<String> instructorIds = new ArrayList<>();
        public List<String> allowedDayIds = new ArrayList<>();
        public List<String> allowedRoomIds = new ArrayList<>();
        public List<PenaltyDef> softPenalties = new ArrayList<>();
    }

    public static class DayDef {
        public String id;
        public String date;
        public int week;
        public String weekday;
        public String phase;
    }

    public static class RoomDef {
        public String id;
        public String name;
        public int capacity;
    }

    public static class PrereqDef {
        public String dependentModuleId;
        public String prerequisiteModuleId;
    }

    public static class PenaltyDef {
        public String dayId;
        public String constraintId;
        public int weight;
    }

    public static class BalanceDef {
        public List<Integer> weeks = new ArrayList<>();
        public int lowerPerWeek;
        public int upperPerWeek;
    }

    public static class SolverOptions {
        public int timeLimitSeconds = 30;
        public Integer randomSeed;
    }

    /** Antwort: Spiegel von RawSolverResult (types.ts Stufe 3). */
    public static class Response {
        public String status;
        public double objectiveValue;
        public List<Assignment> assignments = new ArrayList<>();
        public long solveTimeMs;
        public Score score = new Score();
    }

    public static class Assignment {
        public String sessionId;
        public String dayId;
        public String roomId;
    }

    public static class Score {
        public long hard;
        public long soft;
    }

    // ------------------------------------------------------------------
    // Mapping: Request-DTO → Timefold-Domäne
    // ------------------------------------------------------------------
    static Timetable toProblem(Request req) {
        List<OnCampusDay> days = new ArrayList<>();
        for (DayDef d : req.days) {
            days.add(new OnCampusDay(d.id, d.date, d.week, d.weekday, d.phase));
        }
        List<Room> rooms = new ArrayList<>();
        for (RoomDef r : req.rooms) {
            rooms.add(new Room(r.id, r.name, r.capacity));
        }

        List<PlanningSession> sessions = new ArrayList<>();
        for (SessionDef s : req.sessions) {
            List<OnCampusDay> allowedDays = new ArrayList<>();
            for (OnCampusDay day : days) {
                if (s.allowedDayIds == null || s.allowedDayIds.isEmpty()
                        || s.allowedDayIds.contains(day.getId())) {
                    allowedDays.add(day);
                }
            }
            List<Room> allowedRooms = new ArrayList<>();
            for (Room room : rooms) {
                if (s.allowedRoomIds == null || s.allowedRoomIds.isEmpty()
                        || s.allowedRoomIds.contains(room.getId())) {
                    allowedRooms.add(room);
                }
            }
            PlanningSession ps = new PlanningSession();
            ps.setId(s.id);
            ps.setModuleId(s.moduleId);
            ps.setModuleName(s.moduleName);
            ps.setProgram(s.program);
            ps.setSemester(s.semester);
            ps.setSlotTypes(s.slotTypes == null ? new ArrayList<>() : s.slotTypes);
            ps.setExpectedStudents(s.expectedStudents);
            ps.setInstructorIds(s.instructorIds == null ? new ArrayList<>() : s.instructorIds);
            ps.setAllowedDays(allowedDays);
            ps.setAllowedRooms(allowedRooms);
            ps.setLowerPerWeek(req.weeklyBalance != null ? req.weeklyBalance.lowerPerWeek : 0);
            ps.setUpperPerWeek(req.weeklyBalance != null && req.weeklyBalance.upperPerWeek > 0
                    ? req.weeklyBalance.upperPerWeek : Integer.MAX_VALUE / 2);
            List<SoftPenalty> pens = new ArrayList<>();
            if (s.softPenalties != null) {
                for (PenaltyDef pd : s.softPenalties) {
                    pens.add(new SoftPenalty(pd.dayId, pd.constraintId, pd.weight));
                }
            }
            ps.setSoftPenalties(pens);
            List<String> prereqs = new ArrayList<>();
            if (req.prerequisites != null) {
                for (PrereqDef p : req.prerequisites) {
                    if (p.dependentModuleId != null && p.dependentModuleId.equals(s.moduleId)
                            && p.prerequisiteModuleId != null && !prereqs.contains(p.prerequisiteModuleId)) {
                        prereqs.add(p.prerequisiteModuleId);
                    }
                }
            }
            ps.setPrerequisiteModuleIds(prereqs);
            sessions.add(ps);
        }
        return new Timetable(days, rooms, sessions);
    }

    /** Mapping: gelöste Domäne → Response-DTO. */
    static Response toResponse(Timetable solution) {
        Response r = new Response();
        if (solution.getScore() == null) {
            r.status = "UNKNOWN";
        } else if (solution.getScore().hardScore() < 0) {
            r.status = "INFEASIBLE";
        } else {
            r.status = isFullyAssigned(solution) ? "OPTIMAL" : "FEASIBLE";
        }
        r.score.hard = solution.getScore() == null ? 0 : solution.getScore().hardScore();
        r.score.soft = solution.getScore() == null ? 0 : solution.getScore().softScore();
        r.objectiveValue = r.score.soft;
        if (solution.getSessions() != null) {
            for (PlanningSession s : solution.getSessions()) {
                Assignment a = new Assignment();
                a.sessionId = s.getId();
                a.dayId = s.getDay() == null ? null : s.getDay().getId();
                a.roomId = s.getRoom() == null ? null : s.getRoom().getId();
                r.assignments.add(a);
            }
        }
        return r;
    }

    private static boolean isFullyAssigned(Timetable solution) {
        if (solution.getSessions() == null) return false;
        for (PlanningSession s : solution.getSessions()) {
            if (s.getDay() == null || s.getRoom() == null) return false;
        }
        return true;
    }
}
