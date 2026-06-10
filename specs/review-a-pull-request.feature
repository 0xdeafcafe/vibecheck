# See docs/adr/20260610-system-architecture.md and
# docs/adr/20260610-diff-stratification-heuristics.md for the
# architectural rationale behind this behaviour.
#
# v1 scope: stratified diff reading + closed-loop review submission.
# Out of scope (future specs): bot-comment aggregation, stance-based
# selections / LLM prompt export.

Feature: Review a pull request
  As a code reviewer in an AI-assisted team
  I want to read a PR as a stratified diff and submit my review from vibecheck
  So that I can review huge AI-era PRs efficiently while GitHub remains
  the canonical record

  Background:
    Given I am signed in to vibecheck with my GitHub account
    And the vibecheck GitHub App is installed on the "acme" org

  Scenario: Golden path — read stratified diff and approve
    When I open pull request "acme/widgets#42"
    Then I see the intent panel first, containing the PR description
      and any changed ADR or .feature files
    And the changed files are grouped into strata: intent, core logic,
      tests, and generated
    And generated files are collapsed by default with a one-line summary
    When I add a line comment "extract this into a helper?" on a core
      logic file
    And I submit my review with verdict "Approve" and summary "LGTM"
    Then the line comment, summary, and approval appear on the pull
      request on github.com

  Scenario: Expanding a collapsed generated file
    When I open a pull request containing changes to "package-lock.json"
    Then "package-lock.json" is collapsed under the generated stratum
    When I expand it
    Then I can read its full diff

  Scenario: PR with no intent documents
    When I open a pull request that changes no ADR or .feature files
    Then the intent panel shows only the PR title and description
    And no intent stratum appears in the file list

  Scenario: Requesting changes
    When I review pull request "acme/widgets#43"
    And I submit my review with verdict "Request changes" and a summary
    Then the pull request shows a "changes requested" review from my
      GitHub account on github.com

  Scenario: Review submission fails at GitHub
    Given GitHub's API is returning errors
    When I submit my review
    Then I see an error explaining the submission failed
    And my drafted comments and verdict remain in the form so nothing
      is lost

  Scenario: Org has not installed the GitHub App
    Given the "globex" org has not installed the vibecheck GitHub App
    When I try to open a pull request in "globex/payments"
    Then I am told the app is not installed on that org
    And I am offered a link to request installation

  Scenario: Session token expires mid-review
    Given my GitHub token has expired
    When I perform any action requiring GitHub data
    Then vibecheck refreshes my token transparently if possible
    And otherwise returns me to sign-in without losing my drafted review

  Scenario: Very large pull request
    When I open a pull request with more than 300 changed files
    Then the file list loads progressively
    And the stratified grouping still applies to every loaded file
