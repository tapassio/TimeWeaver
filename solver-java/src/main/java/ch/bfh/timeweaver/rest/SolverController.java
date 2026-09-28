package ch.bfh.timeweaver.rest;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

import ai.timefold.solver.core.api.solver.SolverFactory;
import ai.timefold.solver.core.config.solver.SolverConfig;
import ch.bfh.timeweaver.domain.PlanningSession;
import ch.bfh.timeweaver.domain.Timetable;
import ch.bfh.timeweaver.solver.TimetableConstraintProvider;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST-Schnittstelle des Timefold-Solvers — der Node-Server (TimeWeaver API)
 * ruft genau diesen Endpoint via HTTP auf (TIMEFOLD_URL).
 */
@RestController
@RequestMapping("/api")
public class SolverController {

    @GetMapping("/health")
    public Map<String, Object> health() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("status", "ok");
        out.put("solver", "timefold-solver");
        return out;
    }

    @PostMapping("/solve")
    public SolveApi.Response solve(@RequestBody SolveApi.Request request) {
        Timetable problem = SolveApi.toProblem(request);
        long seconds = request.options != null && request.options.timeLimitSeconds > 0
                ? request.options.timeLimitSeconds : 30;

        SolverConfig config = new SolverConfig()
                .withSolutionClass(Timetable.class)
                .withEntityClasses(PlanningSession.class)
                .withConstraintProviderClass(TimetableConstraintProvider.class)
                .withTerminationSpentLimit(Duration.ofSeconds(seconds));

        SolverFactory<Timetable> solverFactory = SolverFactory.create(config);
        long start = System.currentTimeMillis();
        Timetable solution = solverFactory.buildSolver().solve(problem);
        long elapsed = System.currentTimeMillis() - start;

        SolveApi.Response response = SolveApi.toResponse(solution);
        response.solveTimeMs = elapsed;
        return response;
    }
}
