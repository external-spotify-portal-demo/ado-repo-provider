import { Entity } from "@backstage/catalog-model";
import {
  EntityProvider,
  EntityProviderConnection,
} from "@backstage/plugin-catalog-node";
import { Config } from "@backstage/config";
import { Logger } from "winston";
import { WebApi, getPersonalAccessTokenHandler } from "azure-devops-node-api";
import { GitRepository } from "azure-devops-node-api/interfaces/GitInterfaces";
import { TeamProject } from "azure-devops-node-api/interfaces/CoreInterfaces";
import { GitItem } from "azure-devops-node-api/interfaces/GitInterfaces";
import { SchedulerServiceTaskRunner } from "@backstage/backend-plugin-api";

export interface AzureDevOpsRepoEntityProviderConfig {
  organization: string;
  personalAccessToken: string;
  projectOwnerMap: Config[];
}

export class AzureDevOpsRepoEntityProvider implements EntityProvider {
  private readonly config: AzureDevOpsRepoEntityProviderConfig;
  private readonly logger: Logger;
  private readonly schedule: SchedulerServiceTaskRunner;
  private connection?: EntityProviderConnection;

  static fromConfig(
    config: Config,
    options: {
      logger: Logger;
      schedule: SchedulerServiceTaskRunner;
    }
  ): AzureDevOpsRepoEntityProvider {
    const providerConfig = config.getConfig(
      "catalog.providers.azureDevOpsRepo"
    );

    const organization = providerConfig.getString("organization");
    const personalAccessToken = providerConfig.getString("personalAccessToken");
    const projectOwnerMap = providerConfig.getConfigArray("projectOwnerMap");

    return new AzureDevOpsRepoEntityProvider(
      {
        organization,
        personalAccessToken,
        projectOwnerMap,
      },
      options
    );
  }

  constructor(
    config: AzureDevOpsRepoEntityProviderConfig,
    options: {
      logger: Logger;
      schedule: SchedulerServiceTaskRunner;
    }
  ) {
    this.config = config;
    this.logger = options.logger.child({
      target: this.getProviderName(),
    });
    this.schedule = options.schedule;
    this.logger.info("Azure DevOps Repo Entity Provider initialized");
  }

  getProviderName(): string {
    return `AzureDevOpsRepoEntityProvider`;
  }

  async connect(connection: EntityProviderConnection): Promise<void> {
    this.connection = connection;
    await this.schedule.run({
      id: this.getProviderName(),
      fn: async () => {
        await this.run();
      },
    });
  }

  async run(): Promise<void> {
    if (!this.connection) {
      throw new Error("Not initialized");
    }

    this.logger.info("Discovering Azure DevOps repositories");

    try {
      const entities = await this.discoverRepositories();

      await this.connection.applyMutation({
        type: "full",
        entities: entities.map((entity) => ({
          entity,
          locationKey: this.getProviderName(),
        })),
      });

      this.logger.info(`Discovered ${entities.length} repositories`);
    } catch (error) {
      this.logger.error("Failed to discover repositories", error);
      throw error;
    }
  }

  private async discoverRepositories(): Promise<Entity[]> {
    const authHandler = getPersonalAccessTokenHandler(
      this.config.personalAccessToken
    );
    const connection = new WebApi(this.config.organization, authHandler);

    const coreApi = await connection.getCoreApi();
    const gitApi = await connection.getGitApi();

    // Get all projects
    const projects = await coreApi.getProjects();

    this.logger.info(`Found ${projects.length} projects to process`);

    const entities: Entity[] = [];

    for (const project of projects) {
      if (!project.id || !project.name) {
        continue;
      }

      try {
        // Get repositories for this project
        const repositories = await gitApi.getRepositories(project.id);

        this.logger.debug(
          `Found ${repositories.length} repositories in project ${project.name}`
        );

        for (const repo of repositories) {
          // Skip repositories that already have catalog-info.yaml if configured to do so
          if (await this.hasCatalogInfoFile(gitApi, repo.id!)) {
            this.logger.debug(
              `Skipping repository ${repo.name} in project ${project.name} - catalog-info.yaml already exists`
            );
            continue;
          }

          const entity = this.createRepositoryEntity(repo, project);
          if (entity) {
            entities.push(entity);
          }
        }
      } catch (error) {
        this.logger.warn(
          `Failed to get repositories for project ${project.name}`,
          error
        );
      }
    }

    return entities;
  }

  private async hasCatalogInfoFile(
    gitApi: any,
    repositoryId: string
  ): Promise<boolean> {
    try {
      // Check for catalog-info.yaml in the root of the repository
      const items = await gitApi.getItems(repositoryId, {
        path: "/",
        recursionLevel: "None",
      });

      // Look for catalog-info.yaml or catalog-info.yml files
      const catalogInfoFiles = items.filter(
        (item: GitItem) =>
          item.path === "/catalog-info.yaml" ||
          item.path === "/catalog-info.yml"
      );

      return catalogInfoFiles.length > 0;
    } catch (error) {
      // If we can't check for catalog-info files, assume they don't exist
      // This prevents blocking the entire process due to permission issues
      this.logger.debug(
        `Could not check for catalog-info files in repository ${repositoryId}:`,
        error
      );
      return false;
    }
  }

  private createRepositoryEntity(
    repository: GitRepository,
    project: TeamProject
  ): Entity | null {
    if (!repository.id || !repository.name || !project.name) {
      return null;
    }

    const owner =
      this.config.projectOwnerMap
        .find((p) => p.getString("projectName") === project.name)
        ?.getString("owner") || "unknown";
    const repoUrl = repository.remoteUrl || repository.webUrl;

    if (!repoUrl) {
      this.logger.warn(
        `No URL found for repository ${repository.name} in project ${project.name}`
      );
      return null;
    }

    const entity: Entity = {
      apiVersion: "backstage.io/v1alpha1",
      kind: "Component",
      metadata: {
        name: `${repository.name.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`,
        title: repository.name,
        description: `Repository ${repository.name} in Azure DevOps project ${project.name}`,
        annotations: {
          "azure-devops.com/project-repo": `${project.name}/${repository.name}`,
          "backstage.io/managed-by-location": `azure-devops:${this.config.organization}`,
          "backstage.io/managed-by-origin-location": `azure-devops:${this.config.organization}`,
          "backstage.io/source-location": `url:${repoUrl}/`,
        },
        tags: ["azure-devops", project.name.toLowerCase()],
        links: [
          {
            url: repoUrl,
            title: "Repository",
            icon: "code",
          },
        ],
      },
      spec: {
        type: "repository",
        lifecycle: "experimental",
        owner,
      },
    };

    return entity;
  }
}
