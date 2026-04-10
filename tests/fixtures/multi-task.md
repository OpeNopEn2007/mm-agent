# Multi-Task Dependency Problem

## Problem Statement

A city is planning a transportation network upgrade. The project involves:
1. Analyzing current traffic patterns
2. Designing new routes
3. Estimating construction costs
4. Optimizing budget allocation

Each subtask depends on previous results.

## Task Breakdown

**Task 1: Traffic Analysis**
- Collect traffic data from 10 intersections
- Identify peak congestion times
- Calculate average wait times

**Task 2: Route Design**
- Depends on: Task 1
- Propose 3 alternative routes
- Estimate travel time improvements
- Consider environmental impact

**Task 3: Cost Estimation**
- Depends on: Task 2
- Calculate construction costs for each route
- Include maintenance estimates
- Factor in land acquisition costs

**Task 4: Budget Optimization**
- Depends on: Task 3
- Allocate budget across routes
- Prioritize based on cost-benefit ratio
- Ensure 5-year ROI

## Dependencies

```
Task 1 → Task 2 → Task 3 → Task 4
```

## Objectives

- Complete all tasks in dependency order
- Find optimal budget allocation
- Maximize network efficiency