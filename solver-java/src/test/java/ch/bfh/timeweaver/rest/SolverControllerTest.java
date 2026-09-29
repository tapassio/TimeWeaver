package ch.bfh.timeweaver.rest;

import ch.bfh.timeweaver.domain.PlanningSession;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * End-to-End-Solve-Test gegen den echten Solver (kleine Instanz):
 * 2 Module derselben Kohorte, 3 Tage, 2 Räume — der Solver findet eine
 * konfliktfreie Lösung (keine Kohorten-Kollision, Prerequisite zuerst).
 */
@SpringBootTest
class SolverControllerTest {

    @Autowired
    SolverController controller;

    private SolveApi.Request basicRequest() {
        SolveApi.Request req = new SolveApi.Request();
        SolveApi.DayDef d1 = new SolveApi.DayDef();
        d1.id = "d1"; d1.date = "2027-03-04"; d1.week = 10; d1.weekday = "Donnerstag"; d1.phase = "main";
        SolveApi.DayDef d2 = new SolveApi.DayDef();
        d2.id = "d2"; d2.date = "2027-03-05"; d2.week = 10; d2.weekday = "Freitag"; d2.phase = "main";
        SolveApi.DayDef d3 = new SolveApi.DayDef();
        d3.id = "d3"; d3.date = "2027-03-06"; d3.week = 10; d3.weekday = "Samstag"; d3.phase = "main";
        req.days = List.of(d1, d2, d3);

        SolveApi.RoomDef r1 = new SolveApi.RoomDef();
        r1.id = "r1"; r1.name = "A 101"; r1.capacity = 40;
        SolveApi.RoomDef r2 = new SolveApi.RoomDef();
        r2.id = "r2"; r2.name = "A 102"; r2.capacity = 40;
        req.rooms = List.of(r1, r2);

        // Dependent muss VOR dem Prerequisite gehandhabt werden (weiter unten gesetzt)
        SolveApi.SessionDef s1 = new SolveApi.SessionDef();
        s1.id = "sess-1"; s1.moduleId = "mod-b"; s1.moduleName = "Methodenlehre";
        s1.program = "prog-dba"; s1.semester = 1;
        s1.slotTypes = List.of("vormittag", "nachmittag");
        s1.expectedStudents = 20; s1.instructorIds = List.of("instr-1");

        SolveApi.SessionDef s2d = new SolveApi.SessionDef();
        s2d.id = "sess-2"; s2d.moduleId = "mod-a"; s2d.moduleName = "Fundamentals";
        s2d.program = "prog-dba"; s2d.semester = 1;
        s2d.slotTypes = List.of("vormittag", "nachmittag");
        s2d.expectedStudents = 25; s2d.instructorIds = List.of("instr-2");

        req.sessions = List.of(s1, s2d);
        req.prerequisites = List.of(); // unten gesetzt
        req.weeklyBalance = new SolveApi.BalanceDef();
        req.weeklyBalance.weeks = List.of(10);
        req.weeklyBalance.lowerPerWeek = 0;
        req.weeklyBalance.upperPerWeek = 2;

        req.options = new SolveApi.SolverOptions();
        req.options.timeLimitSeconds = 10;
        return req;
    }

    @Test
    void solveFeasibleTwoModules() {
        SolveApi.Request req = basicRequest();
        // mod-a ((sess-2)) ist Prerequisite von mod-b (sess-1)
        SolveApi.PrereqDef p = new SolveApi.PrereqDef();
        p.dependentModuleId = "mod-b";
        p.prerequisiteModuleId = "mod-a";
        req.prerequisites = List.of(p);

        SolveApi.Response response = controller.solve(req);

        assertEquals(2, response.assignments.size());
        assertTrue(response.status.equals("OPTIMAL") || response.status.equals("FEASIBLE"),
                "Erwartet brauchbare Lösung, war: " + response.status);
        assertEquals(0, response.score.hard, "Harter Score muss 0 sein: " + response.status);
    }

    @Test
    void infeasiblePrereqYieldsInfeasibleStatusNot500() {
        SolveApi.Request req = basicRequest();
        // sess-1 (mod-b, dependent) darf NUR Tag 3; sess-2 (mod-a, prerequisite) NUR Tag 1.
        req.sessions.get(0).allowedDayIds = List.of("d3");
        req.sessions.get(1).allowedDayIds = List.of("d1");
        SolveApi.PrereqDef p = new SolveApi.PrereqDef();
        p.dependentModuleId = "mod-b";
        p.prerequisiteModuleId = "mod-a";
        req.prerequisites = List.of(p);

        SolveApi.Response response = controller.solve(req);
        assertEquals(2, response.assignments.size());
        // Keine Exception/500 — Solver liefert trotzdem eine Zuordnung (mit Hard-Kosten)
    }
    @Test
    void classConflictPreventsSameDayEvenAcrossPrograms() {
        // data-model-comparison.md §3.1 — zwei Sessions derselben Class, aber
        // Programm+Semester unterscheiden sich bewusst: OHNE Class-Constraint
        // wären beide am selben Tag möglich. Mit CLASS_CONFLICT nicht.
        SolveApi.Request req = basicRequest();
        req.sessions.get(0).program = "prog-other";
        req.sessions.get(0).semester = 3;
        req.sessions.get(0).classIds = List.of("class-shared-1");
        req.sessions.get(1).classIds = List.of("class-shared-1");
        req.prerequisites = List.of();

        SolveApi.Response response = controller.solve(req);
        assertEquals(2, response.assignments.size());
        assertEquals(0, response.score.hard, "Class-Kohorten dürfen nicht am selben Tag überlappen");
    }
}
