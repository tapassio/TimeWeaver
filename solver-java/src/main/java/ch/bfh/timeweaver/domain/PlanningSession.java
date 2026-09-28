package ch.bfh.timeweaver.domain;

import java.util.ArrayList;
import java.util.List;

import ai.timefold.solver.core.api.domain.common.PlanningId;
import ai.timefold.solver.core.api.domain.entity.PlanningEntity;
import ai.timefold.solver.core.api.domain.variable.PlanningVariable;

/**
 * Planner-Entität: ein Teil-Session-Block eines Moduls (Kap. 10.3 —
 * 6 ECTS = 3 Tage, 3 ECTS = 1.5 Tage ⇒ mehrere Teil-Sessions pro Modul).
 * Planungsvariablen: Tag + Raum.
 */
@PlanningEntity
public class PlanningSession {

    @PlanningId
    private String id;
    private String moduleId;
    private String moduleName;
    private String program;
    private Integer semester;
    private List<String> slotTypes = new ArrayList<>();
    private int expectedStudents;
    private List<String> instructorIds = new ArrayList<>();
    private List<String> prerequisiteModuleIds = new ArrayList<>();

    private List<SoftPenalty> softPenalties = new ArrayList<>();
    private List<OnCampusDay> allowedDays = new ArrayList<>();
    private List<Room> allowedRooms = new ArrayList<>();

    /** Wochenbalance-Bounds (identische Kopie für alle Sessions, Kap. WEEKLY_BALANCE). */
    private int lowerPerWeek;
    private int upperPerWeek = Integer.MAX_VALUE / 2;

    // Planning variables
    private OnCampusDay day;
    private Room room;

    public PlanningSession() {
    }

    public PlanningSession(String id, String moduleId, String program, Integer semester,
            List<String> slotTypes, int expectedStudents, List<String> instructorIds,
            List<OnCampusDay> allowedDays, List<Room> allowedRooms) {
        this.id = id;
        this.moduleId = moduleId;
        this.program = program;
        this.semester = semester;
        this.slotTypes = slotTypes;
        this.expectedStudents = expectedStudents;
        this.instructorIds = instructorIds;
        this.allowedDays = allowedDays;
        this.allowedRooms = allowedRooms;
    }

    @PlanningVariable
    public OnCampusDay getDay() {
        return day;
    }

    public void setDay(OnCampusDay day) {
        this.day = day;
    }

    @PlanningVariable
    public Room getRoom() {
        return room;
    }

    public void setRoom(Room room) {
        this.room = room;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getModuleId() {
        return moduleId;
    }

    public void setModuleId(String moduleId) {
        this.moduleId = moduleId;
    }

    public String getModuleName() {
        return moduleName;
    }

    public void setModuleName(String moduleName) {
        this.moduleName = moduleName;
    }

    public String getProgram() {
        return program;
    }

    public void setProgram(String program) {
        this.program = program;
    }

    public Integer getSemester() {
        return semester;
    }

    public void setSemester(Integer semester) {
        this.semester = semester;
    }

    public List<String> getSlotTypes() {
        return slotTypes;
    }

    public void setSlotTypes(List<String> slotTypes) {
        this.slotTypes = slotTypes;
    }

    public int getExpectedStudents() {
        return expectedStudents;
    }

    public void setExpectedStudents(int expectedStudents) {
        this.expectedStudents = expectedStudents;
    }

    public List<String> getInstructorIds() {
        return instructorIds;
    }

    public void setInstructorIds(List<String> instructorIds) {
        this.instructorIds = instructorIds;
    }

    public List<String> getPrerequisiteModuleIds() {
        return prerequisiteModuleIds;
    }

    public void setPrerequisiteModuleIds(List<String> prerequisiteModuleIds) {
        this.prerequisiteModuleIds = prerequisiteModuleIds;
    }

    public List<SoftPenalty> getSoftPenalties() {
        return softPenalties;
    }

    public void setSoftPenalties(List<SoftPenalty> softPenalties) {
        this.softPenalties = softPenalties;
    }

    public List<OnCampusDay> getAllowedDays() {
        return allowedDays;
    }

    public void setAllowedDays(List<OnCampusDay> allowedDays) {
        this.allowedDays = allowedDays;
    }

    public List<Room> getAllowedRooms() {
        return allowedRooms;
    }

    public void setAllowedRooms(List<Room> allowedRooms) {
        this.allowedRooms = allowedRooms;
    }

    public int getLowerPerWeek() {
        return lowerPerWeek;
    }

    public void setLowerPerWeek(int lowerPerWeek) {
        this.lowerPerWeek = lowerPerWeek;
    }

    public int getUpperPerWeek() {
        return upperPerWeek;
    }

    public void setUpperPerWeek(int upperPerWeek) {
        this.upperPerWeek = upperPerWeek;
    }
}
