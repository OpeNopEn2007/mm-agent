# Simple Optimization Problem

## Problem Statement

A factory produces two types of products: Product A and Product B.
Each Product A requires 2 hours of labor and 3 hours of machine time.
Each Product B requires 4 hours of labor and 2 hours of machine time.

The factory has 40 hours of labor and 30 hours of machine time available per day.
Product A yields a profit of $50 per unit.
Product B yields a profit of $60 per unit.

## Goal

Determine how many units of each product should be produced to maximize profit.

## Questions

1. Formulate this as a linear programming problem.
2. Solve for the optimal production quantities.
3. Calculate the maximum profit.

## Constraints

- Labor hours: 2A + 4B ≤ 40
- Machine hours: 3A + 2B ≤ 30
- Non-negativity: A ≥ 0, B ≥ 0
- A and B must be integers

## Objectives

- Maximize profit: P = 50A + 60B
- Find integer solution