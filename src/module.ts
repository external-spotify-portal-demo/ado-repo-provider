// @ts-nocheck
// Example: Backend module for the new Backstage backend system
// Add this to your backend in packages/backend/src/index.ts

import { createBackend } from "@backstage/backend-defaults";
import {
  createBackendModule,
  coreServices,
  readSchedulerServiceTaskScheduleDefinitionFromConfig,
} from "@backstage/backend-plugin-api";
import { catalogProcessingExtensionPoint } from "@backstage/plugin-catalog-node/alpha";
import { AzureDevOpsRepoEntityProvider } from "./providers/AzureDevOpsEntityProvider";

/**
 * Catalog backend module for the Azure DevOps repository entity provider.
 *
 * @alpha
 */
export const catalogModuleAzureDevOpsEntityProvider = createBackendModule({
  pluginId: "catalog",
  moduleId: "azure-devops-repo-entity-provider",
  register(env) {
    env.registerInit({
      deps: {
        catalog: catalogProcessingExtensionPoint,
        config: coreServices.rootConfig,
        logger: coreServices.logger,
        scheduler: coreServices.scheduler,
      },
      async init({ catalog, config, logger, scheduler }) {
        logger.info("Initializing Azure DevOps Repo Entity Provider");
        const providerConfig = config.getConfig(
          "catalog.providers.azureDevOpsRepo"
        );

        const schedule = providerConfig.has("schedule")
          ? readSchedulerServiceTaskScheduleDefinitionFromConfig(
              providerConfig.getConfig("schedule")
            )
          : {
              frequency: { minutes: 60 },
              timeout: { minutes: 50 },
            };
        catalog.addEntityProvider(
          AzureDevOpsRepoEntityProvider.fromConfig(config, {
            logger,
            schedule: scheduler.createScheduledTaskRunner(schedule),
          })
        );
      },
    });
  },
});
