from enum import Enum
from typing import Annotated

from dotenv import load_dotenv
from langchain.agents import create_agent
from langchain.tools import tool, InjectedToolCallId
from langchain_community.agent_toolkits.github.toolkit import GitHubToolkit
from langchain_community.utilities.github import GitHubAPIWrapper
from langchain_core.messages import ToolMessage
from langchain_groq import ChatGroq
from langgraph.types import Command

from .utils import (
    rename_tool,
    get_issue_tools,
    get_release_tools,
    get_code_review_tools,
    get_documentation_tools,
)

load_dotenv()


llm = ChatGroq(model="openai/gpt-oss-120b")
github = GitHubAPIWrapper()
toolkit = GitHubToolkit.from_github_api_wrapper(github, include_release_tools=True)
tools = [rename_tool(t) for t in toolkit.get_tools()]

# Creating Subagents
_documentation_agent = create_agent(
    model=llm,
    tools=get_documentation_tools(tools),
    name="documentation_agent",
    system_prompt=(
        "You are a documentation agent. Your task is to help write and maintain project documentation, "
        "including README files, API docs, and other relevant materials. Use the provided tools to read "
        "existing files, search code, and create or update documentation as needed. Always ensure that the "
        "documentation is clear, concise, and up-to-date with the latest project changes. "
        "Always include the full result of your work in your final message so the coordinator can see it."
    ),
)

_release_notes_agent = create_agent(
    model=llm,
    tools=get_release_tools(tools),
    name="release_notes_agent",
    system_prompt=(
        "You are a release notes agent. Your task is to generate comprehensive and clear release notes for "
        "new software releases. Use the provided tools to gather information about the latest releases, "
        "including pull requests, commits, and issues. Ensure that the release notes highlight key features, "
        "bug fixes, and any other important changes in a user-friendly manner. "
        "Always include the full release notes text in your final message so the coordinator can see it."
    ),
)

_issue_agent = create_agent(
    model=llm,
    tools=get_issue_tools(tools),
    name="issue_agent",
    system_prompt=(
        "You are an issue management agent. Your task is to help manage and resolve issues within the project. "
        "Use the provided tools to search for existing issues, retrieve detailed information about specific "
        "issues, and add comments or updates as necessary. Ensure that issues are addressed promptly and that "
        "all relevant information is documented clearly. "
        "Always include a summary of all actions taken in your final message so the coordinator can see it."
    ),
)

_code_review_agent = create_agent(
    model=llm,
    tools=get_code_review_tools(tools),
    name="code_review_agent",
    system_prompt=(
        "You are a code review agent. Your task is to assist in reviewing code changes and pull requests "
        "within the project. Use the provided tools to list open pull requests, examine the files changed in "
        "each pull request, and read specific files as needed. Provide constructive feedback on code quality, "
        "adherence to coding standards, and potential improvements to ensure high-quality contributions. "
        "Always include your full review in your final message so the coordinator can see it."
    ),
)

# Enum for type-safe dispatch
class AgentName(str, Enum):
    DOCUMENTATION = "documentation_agent"
    RELEASE_NOTES = "release_notes_agent"
    ISSUE = "issue_agent"
    CODE_REVIEW = "code_review_agent"


# Subagent-as-tool wrappers
@tool(
    "documentation_agent",
    description=(
        "Handles project documentation tasks: writing/updating README files, API docs, and any "
        "other project documentation. Pass a clear description of the documentation task to perform."
    ),
)
def call_documentation_agent(
    task: str,
    tool_call_id: Annotated[str, InjectedToolCallId],
) -> Command:
    result = _documentation_agent.invoke({"messages": [{"role": "user", "content": task}]})
    return Command(update={
        "messages": [ToolMessage(content=result["messages"][-1].content, tool_call_id=tool_call_id)]
    })


@tool(
    "release_notes_agent",
    description=(
        "Generates comprehensive release notes for new software versions by inspecting the latest "
        "releases, pull requests, and issues. Pass the release scope or version as the task."
    ),
)
def call_release_notes_agent(
    task: str,
    tool_call_id: Annotated[str, InjectedToolCallId],
) -> Command:
    result = _release_notes_agent.invoke({"messages": [{"role": "user", "content": task}]})
    return Command(update={
        "messages": [ToolMessage(content=result["messages"][-1].content, tool_call_id=tool_call_id)]
    })


@tool(
    "issue_agent",
    description=(
        "Manages and resolves project issues: searching issues, retrieving issue details, and adding "
        "comments. Pass a clear description of the issue management task to perform."
    ),
)
def call_issue_agent(
    task: str,
    tool_call_id: Annotated[str, InjectedToolCallId],
) -> Command:
    result = _issue_agent.invoke({"messages": [{"role": "user", "content": task}]})
    return Command(update={
        "messages": [ToolMessage(content=result["messages"][-1].content, tool_call_id=tool_call_id)]
    })


@tool(
    "code_review_agent",
    description=(
        "Reviews code changes and pull requests: lists open PRs, examines changed files, reads "
        "source files, and provides constructive feedback. Pass a description of the review task."
    ),
)
def call_code_review_agent(
    task: str,
    tool_call_id: Annotated[str, InjectedToolCallId],
) -> Command:
    result = _code_review_agent.invoke({"messages": [{"role": "user", "content": task}]})
    return Command(update={
        "messages": [ToolMessage(content=result["messages"][-1].content, tool_call_id=tool_call_id)]
    })


# Main coordinator agent
github_agent = create_agent(
    model=llm,
    tools=[
        call_documentation_agent,
        call_release_notes_agent,
        call_issue_agent,
        call_code_review_agent,
    ],
    system_prompt=(
        "You are a GitHub project coordinator that delegates tasks to specialized subagents via tools. "
        "Available subagents:\n"
        "- documentation_agent: writes and maintains README files, API docs, and other project documentation\n"
        "- release_notes_agent: generates release notes for new software versions\n"
        "- issue_agent: searches, retrieves, and comments on project issues\n"
        "- code_review_agent: reviews pull requests and provides code quality feedback\n\n"
        "Delegate each task to the most appropriate subagent. "
        "Invoke one subagent at a time. Do not perform any GitHub operations yourself — "
        "always use the provided tools to delegate work."
    ),
)


if __name__ == "__main__":
    res = github_agent.invoke({
        "messages": [
            {
                "role": "user",
                "content": "Create a documentation and raise a PR for it.",
            }
        ]
    })
    print(res)
