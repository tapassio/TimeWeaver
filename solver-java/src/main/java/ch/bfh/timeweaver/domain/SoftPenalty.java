package ch.bfh.timeweaver.domain;

import java.util.ArrayList;
import java.util.List;

/** Weiche Präferenz je Tag aus dem Tag-/Outlook-Katalog (Kap. constraintCatalog). */
public class SoftPenalty {
    private String dayId;
    private String constraintId;
    private int weight;

    public SoftPenalty() {
    }

    public SoftPenalty(String dayId, String constraintId, int weight) {
        this.dayId = dayId;
        this.constraintId = constraintId;
        this.weight = weight;
    }

    public String getDayId() {
        return dayId;
    }

    public String getConstraintId() {
        return constraintId;
    }

    public int getWeight() {
        return weight;
    }
}
