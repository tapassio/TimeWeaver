package ch.bfh.timeweaver.solver;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;

import ai.timefold.solver.core.api.score.HardSoftScore;
import ai.timefold.solver.core.api.score.stream.Constraint;
import ai.timefold.solver.core.api.score.stream.ConstraintCollectors;
import ai.timefold.solver.core.api.score.stream.ConstraintFactory;
import ai.timefold.solver.core.api.score.stream.ConstraintProvider;
import ai.timefold.solver.core.api.score.stream.Joiners;
import ch.bfh.timeweaver.domain.PlanningSession;
import ch.bfh.timeweaver.domain.SoftPenalty;

/**
 * Timefold-Portierung des CP-SAT-Constraint-Katalogs (Kap. 3.3).
 * Stabile IDs bleiben identisch — der explain/report-Pfad der TS-Seite
 * hängt an denselben IDs.
 *
 * Hard:  SAME_MODULE_DISTINCT_DAYS, NO_TEACHER_OVERLAP, COHORT_CONFLICT,
 *        ROOM_OCCUPANCY, ROOM_CAPACITY, MODULE_PREREQUISITE_ORDER,
 *        WEEKLY_BALANCE, ALLOWED_DAY_FILTER, ALLOWED_ROOM_FILTER
 * Soft:  TEACHER_ROOM_STABILITY (10), TEACHER_MAKESPAN (5),
 *        SOFT_PENALTY_PREFERENCE (Katalog-Gewichte * 1000),
 *        PREFER_EARLY_DATES (unscaled Tie-Breaker)
 */
public final class TimetableConstraintProvider implements ConstraintProvider {

    private static final int SOFT_PENALTY_SCALE = 1000;

    @Override
    public Constraint[] defineConstraints(ConstraintFactory factory) {
        return new Constraint[] {
                // Hard
                sameModuleDistinctDays(factory),
                teacherConflict(factory),
                cohortConflict(factory),
                classConflict(factory),
                roomOccupancyConflict(factory),
                roomCapacityOverflow(factory),
                prerequisiteOrder(factory),
                weeklyBalance(factory),
                allowedDayFilter(factory),
                allowedRoomFilter(factory),
                // Soft
                teacherRoomStability(factory),
                teacherMakespan(factory),
                softPenaltyPreference(factory),
                preferEarlyDates(factory),
        };
    }

    // ------------------------------------------------------------------
    // Hard: mehrere Sessions desselben Moduls dürfen nicht am selben Tag sein
    // (vgl. addAllDifferent(dayVars) je Modul in CpSatTsTimetableSolver)
    // ------------------------------------------------------------------
    Constraint sameModuleDistinctDays(ConstraintFactory factory) {
        return factory.forEach(PlanningSession.class)
                .join(PlanningSession.class,
                        Joiners.equal(PlanningSession::getModuleId),
                        Joiners.lessThan(PlanningSession::getId))
                .filter((a, b) -> a.getDay() != null && a.getDay().equals(b.getDay()))
                .penalize(HardSoftScore.ONE_HARD)
                .asConstraint("SAME_MODULE_DISTINCT_DAYS");
    }

    // ------------------------------------------------------------------
    // Hard: Dozent-Konflikt — überlappende SlotTypes am selben Tag
    // ------------------------------------------------------------------
    Constraint teacherConflict(ConstraintFactory factory) {
        return factory.forEachUniquePair(PlanningSession.class,
                        Joiners.equal(PlanningSession::getDay))
                .filter((a, b) -> slotsOverlap(a, b) && shareInstructor(a, b)
                        && !a.getModuleId().equals(b.getModuleId()))
                .penalize(HardSoftScore.ONE_HARD)
                .asConstraint("NO_TEACHER_OVERLAP");
    }

    // ------------------------------------------------------------------
    // Hard: Kohorten-Konflikt (Programm+Semester) — Kap. 11.1
    // ------------------------------------------------------------------
    Constraint cohortConflict(ConstraintFactory factory) {
        return factory.forEachUniquePair(PlanningSession.class,
                        Joiners.equal(PlanningSession::getProgram),
                        Joiners.equal(s -> semKey(s)))
                .filter((a, b) -> a.getDay() != null && a.getDay().equals(b.getDay())
                        && slotsOverlap(a, b)
                        && !a.getModuleId().equals(b.getModuleId()))
                .penalize(HardSoftScore.ONE_HARD)
                .asConstraint("COHORT_CONFLICT");
    }

    // ------------------------------------------------------------------
    // Hard: CLASS_CONFLICT — data-model-comparison.md §3.1: zwei Sessions
    // derselben Kohorte (Class) dürfen nicht gleichzeitig am selben Tag
    // überlappende SlotTypes belegen. Die Class ersetzt die implizite
    // program+semester-Verwandtschaft, sobald sie gesetzt ist.
    // ------------------------------------------------------------------
    Constraint classConflict(ConstraintFactory factory) {
        return factory.forEachUniquePair(PlanningSession.class)
                .filter((a, b) -> a.getDay() != null && a.getDay().equals(b.getDay())
                        && slotsOverlap(a, b)
                        && !a.getModuleId().equals(b.getModuleId())
                        && shareClass(a, b))
                .penalize(HardSoftScore.ONE_HARD)
                .asConstraint("CLASS_CONFLICT");
    }

    // ------------------------------------------------------------------
    // Hard: Raum doppelt belegt — ROOM_OCCUPANCY
    // ------------------------------------------------------------------
    Constraint roomOccupancyConflict(ConstraintFactory factory) {
        return factory.forEachUniquePair(PlanningSession.class,
                        Joiners.equal(PlanningSession::getDay),
                        Joiners.equal(PlanningSession::getRoom))
                .filter((a, b) -> slotsOverlap(a, b))
                .penalize(HardSoftScore.ONE_HARD)
                .asConstraint("ROOM_OCCUPANCY");
    }

    // ------------------------------------------------------------------
    // Hard: Raumkapazität — ROOM_CAPACITY
    // ------------------------------------------------------------------
    Constraint roomCapacityOverflow(ConstraintFactory factory) {
        return factory.forEach(PlanningSession.class)
                .filter(s -> s.getRoom() != null && s.getRoom().getCapacity() < s.getExpectedStudents())
                .penalize(HardSoftScore.ONE_HARD)
                .asConstraint("ROOM_CAPACITY");
    }

    // ------------------------------------------------------------------
    // Hard: Prerequisite-Ordnung — Kap. 10.1/11.3
    // (dependent.prerequisiteModuleIds enthält prerequisite.moduleId)
    // ------------------------------------------------------------------
    Constraint prerequisiteOrder(ConstraintFactory factory) {
        return factory.forEach(PlanningSession.class)
                .flatten(PlanningSession::getPrerequisiteModuleIds)
                .join(factory.<PlanningSession>forEach(PlanningSession.class),
                        Joiners.equal(
                                (PlanningSession dependent, String prereqModuleId) -> prereqModuleId,
                                PlanningSession::getModuleId))
                .filter((PlanningSession dependent, String prereqId, PlanningSession prereq) ->
                        dateOf(dependent) != null && dateOf(prereq) != null
                                && !dateOf(prereq).isBefore(dateOf(dependent)))
                .penalize(HardSoftScore.ONE_HARD)
                .asConstraint("MODULE_PREREQUISITE_ORDER");
    }

    // ------------------------------------------------------------------
    // Hard: Wochenbalance — lower/upper Sessions je Kalenderwoche.
    // Bounds kommen als identische Kopie auf jeder Session mit.
    // ------------------------------------------------------------------
    Constraint weeklyBalance(ConstraintFactory factory) {
        return factory.forEach(PlanningSession.class)
                .filter(s -> s.getDay() != null)
                .groupBy(s -> s.getDay().getWeek(),
                        ConstraintCollectors.count(),
                        ConstraintCollectors.min(PlanningSession::getLowerPerWeek),
                        ConstraintCollectors.min(PlanningSession::getUpperPerWeek))
                .filter((Integer week, Long count, Integer lower, Integer upper) ->
                        count.intValue() > upper.intValue() || count.intValue() < lower.intValue())
                .penalize(HardSoftScore.ONE_HARD)
                .asConstraint("WEEKLY_BALANCE");
    }

    // ------------------------------------------------------------------
    // Hard: harte Tages-/Raumfilter aus buildSolverInput widerspiegeln
    // (wertet die allowed*Ids-Ranges als Constraints aus)
    // ------------------------------------------------------------------
    Constraint allowedDayFilter(ConstraintFactory factory) {
        return factory.forEach(PlanningSession.class)
                .filter(s -> s.getDay() != null
                        && !s.getAllowedDays().isEmpty()
                        && s.getAllowedDays().stream().noneMatch(d -> d.getId().equals(s.getDay().getId())))
                .penalize(HardSoftScore.ONE_HARD)
                .asConstraint("ALLOWED_DAY_FILTER");
    }

    Constraint allowedRoomFilter(ConstraintFactory factory) {
        return factory.forEach(PlanningSession.class)
                .filter(s -> s.getRoom() != null
                        && !s.getAllowedRooms().isEmpty()
                        && s.getAllowedRooms().stream().noneMatch(r -> r.getId().equals(s.getRoom().getId())))
                .penalize(HardSoftScore.ONE_HARD)
                .asConstraint("ALLOWED_ROOM_FILTER");
    }

    // ------------------------------------------------------------------
    // Soft: TEACHER_ROOM_STABILITY — Sessions eines Moduls in demselben Raum (weight 10)
    // ------------------------------------------------------------------
    Constraint teacherRoomStability(ConstraintFactory factory) {
        return factory.forEach(PlanningSession.class)
                .join(PlanningSession.class,
                        Joiners.equal(PlanningSession::getModuleId),
                        Joiners.lessThan(PlanningSession::getId))
                .filter((a, b) -> a.getRoom() != null && b.getRoom() != null
                        && !a.getRoom().getId().equals(b.getRoom().getId()))
                .penalize(HardSoftScore.ONE_SOFT, (a, b) ->
                        SOFT_PENALTY_SCALE * catalogWeight("TEACHER_ROOM_STABILITY"))
                .asConstraint("TEACHER_ROOM_STABILITY");
    }

    // ------------------------------------------------------------------
    // Soft: TEACHER_MAKESPAN — Zeitspanne (max-min Tag) der Sessions je
    // Dozierender minimieren (weight 5)
    // ------------------------------------------------------------------
    // ------------------------------------------------------------------
    // Soft: TEACHER_MAKESPAN — Zeitspanne der Sessions je Dozierender
    // minimieren (weight 5). Pairwise-Surrogat als Spannweiten-Metriker:
    // die Summe der Paardistanzen drückt Treue der Spannweite (max-min) down.
    // ------------------------------------------------------------------
    Constraint teacherMakespan(ConstraintFactory factory) {
        return factory.forEachUniquePair(PlanningSession.class)
                .filter((PlanningSession a, PlanningSession b) ->
                        shareInstructor(a, b) && dateOf(a) != null && dateOf(b) != null)
                .filter((PlanningSession a, PlanningSession b) -> !dateOf(a).equals(dateOf(b)))
                .penalize(HardSoftScore.ONE_SOFT, (PlanningSession a, PlanningSession b) ->
                        SOFT_PENALTY_SCALE * catalogWeight("TEACHER_MAKESPAN")
                                * Math.abs((int) ChronoUnit.DAYS.between(dateOf(a), dateOf(b))))
                .asConstraint("TEACHER_MAKESPAN");
    }

    // ------------------------------------------------------------------
    // Soft: Soft-Penalties je Session/Tag (Outlook, Day-Tags, AVOID_*)
    // ------------------------------------------------------------------
    Constraint softPenaltyPreference(ConstraintFactory factory) {
        return factory.forEach(PlanningSession.class)
                .flatten(PlanningSession::getSoftPenalties)
                .filter((PlanningSession session, SoftPenalty penalty) -> session.getDay() != null
                        && penalty.getDayId() != null
                        && penalty.getWeight() > 0
                        && session.getDay().getId().equals(penalty.getDayId()))
                .penalize(HardSoftScore.ONE_SOFT,
                        (PlanningSession session, SoftPenalty penalty) ->
                                SOFT_PENALTY_SCALE * penalty.getWeight())
                .asConstraint("SOFT_PENALTY_PREFERENCE");
    }

    // ------------------------------------------------------------------
    // Soft: Tie-Breaker — frühere Wochen bevorzugen (unskaliert, klein)
    // ------------------------------------------------------------------
    Constraint preferEarlyDates(ConstraintFactory factory) {
        return factory.forEach(PlanningSession.class)
                .filter(s -> s.getDay() != null)
                .penalize(HardSoftScore.ONE_SOFT, s -> s.getDay().getWeek())
                .asConstraint("PREFER_EARLY_DATES");
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    /** 'vormittag' / 'nachmittag' / 'abend' — Slot-Kategorien, Überlappung nur wenn identische Kategorie. */
    static boolean slotsOverlap(PlanningSession a, PlanningSession b) {
        if (a.getSlotTypes() == null || b.getSlotTypes() == null) return false;
        return a.getSlotTypes().stream().anyMatch(b.getSlotTypes()::contains);
    }

    static boolean shareClass(PlanningSession a, PlanningSession b) {
        if (a.getClassIds() == null) return false;
        return b.getClassIds() != null
                && a.getClassIds().stream().anyMatch(b.getClassIds()::contains);
    }

    static boolean shareInstructor(PlanningSession a, PlanningSession b) {
        if (a.getInstructorIds() == null) return false;
        return b.getInstructorIds() != null
                && a.getInstructorIds().stream().anyMatch(b.getInstructorIds()::contains);
    }

    private static String semKey(PlanningSession s) {
        return s.getSemester() == null ? "default" : s.getSemester().toString();
    }

    /** Stabile Katalog-Gewichte (constraintCatalog.ts) — bewusst statisch, kein Roundtrip. */
    private static int catalogWeight(String id) {
        switch (id) {
            case "TEACHER_ROOM_STABILITY": return 10;
            case "TEACHER_MAKESPAN": return 5;
            default: return 1;
        }
    }

    private static int spreadDays(List<LocalDate> dates) {
        LocalDate min = null;
        LocalDate max = null;
        for (LocalDate d : dates) {
            if (d == null) continue;
            if (min == null || d.isBefore(min)) min = d;
            if (max == null || d.isAfter(max)) max = d;
        }
        if (min == null || max == null || min.equals(max)) {
            return 0;
        }
        return (int) ChronoUnit.DAYS.between(min, max);
    }

    private static LocalDate dateOf(PlanningSession s) {
        if (s == null || s.getDay() == null || s.getDay().getDate() == null) return null;
        return LocalDate.parse(s.getDay().getDate());
    }
}
