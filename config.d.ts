/*
 * Copyright 2020 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { SchedulerServiceTaskScheduleDefinitionConfig } from '@backstage/backend-plugin-api';

export interface Config {
  catalog?: {
    providers?: {
      azureDevOpsRepo?: {
        /**
         * Azure DevOps organization URL
         * @visibility frontend
         */
        organization: string;
        /**
         * Personal Access Token for authentication
         * @visibility secret
         */
        personalAccessToken: string;
        /**
         * Map of project names to owner groups/users
         * @visibility frontend
         */
        projectOwnerMap?: { 
          projectName: string;
          owner: string;
        }[];
        /**
         * Schedule configuration (optional - can be provided via backend integration)
         * @visibility frontend
         */
        schedule?: SchedulerServiceTaskScheduleDefinitionConfig;
      };
    };
  };
} 