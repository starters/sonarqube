/*
 * SonarQube
 * Copyright (C) 2009-2020 SonarSource SA
 * mailto:info AT sonarsource DOT com
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 3 of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program; if not, write to the Free Software Foundation,
 * Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 */
import * as React from 'react';
import { connect } from 'react-redux';
import { WithRouterProps } from 'react-router';
import {
  checkPersonalAccessTokenIsValid,
  getBitbucketServerProjects,
  getBitbucketServerRepositories,
  importBitbucketServerProject,
  setAlmPersonalAccessToken
} from '../../../api/alm-integrations';
import { getAppState, Store } from '../../../store/rootReducer';
import { BitbucketProject, BitbucketRepository } from '../../../types/alm-integration';
import { AlmSettingsInstance } from '../../../types/alm-settings';
import BitbucketCreateProjectRenderer from './BitbucketProjectCreateRenderer';

interface Props extends Pick<WithRouterProps, 'location'> {
  bitbucketSettings: AlmSettingsInstance[];
  canAdmin?: boolean;
  loadingBindings: boolean;
  onProjectCreate: (projectKeys: string[]) => void;
}

interface State {
  bitbucketSetting?: AlmSettingsInstance;
  importing: boolean;
  loading: boolean;
  patIsValid?: boolean;
  projects?: BitbucketProject[];
  projectRepositories?: T.Dict<BitbucketRepository[]>;
  selectedRepository?: BitbucketRepository;
  submittingToken?: boolean;
}

export class BitbucketProjectCreate extends React.PureComponent<Props, State> {
  mounted = false;

  constructor(props: Props) {
    super(props);
    this.state = {
      // For now, we only handle a single instance. So we always use the first
      // one from the list.
      bitbucketSetting: props.bitbucketSettings[0],
      importing: false,
      loading: false
    };
  }

  componentDidMount() {
    this.mounted = true;
    this.fetchInitialData();
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.bitbucketSettings.length === 0 && this.props.bitbucketSettings.length > 0) {
      this.setState({ bitbucketSetting: this.props.bitbucketSettings[0] });
      this.fetchInitialData();
    }
  }

  componentWillUnmount() {
    this.mounted = false;
  }

  fetchInitialData = async () => {
    this.setState({ loading: true });

    const patIsValid = await this.checkPersonalAccessToken().catch(() => false);

    let projects;
    if (patIsValid) {
      projects = await this.fetchBitbucketProjects().catch(() => undefined);
    }

    let projectRepositories;
    if (projects && projects.length > 0) {
      projectRepositories = await this.fetchBitbucketRepositories(projects).catch(() => undefined);
    }

    if (this.mounted) {
      this.setState({
        patIsValid,
        projects,
        projectRepositories,
        loading: false
      });
    }
  };

  checkPersonalAccessToken = () => {
    const { bitbucketSetting } = this.state;

    if (!bitbucketSetting) {
      return Promise.resolve(false);
    }

    return checkPersonalAccessTokenIsValid(bitbucketSetting.key);
  };

  fetchBitbucketProjects = (): Promise<BitbucketProject[] | undefined> => {
    const { bitbucketSetting } = this.state;

    if (!bitbucketSetting) {
      return Promise.resolve(undefined);
    }

    return getBitbucketServerProjects(bitbucketSetting.key).then(({ projects }) => projects);
  };

  fetchBitbucketRepositories = (
    projects: BitbucketProject[]
  ): Promise<T.Dict<BitbucketRepository[]> | undefined> => {
    const { bitbucketSetting } = this.state;

    if (!bitbucketSetting) {
      return Promise.resolve(undefined);
    }

    return Promise.all(
      projects.map(p => {
        return getBitbucketServerRepositories(bitbucketSetting.key, p.name).then(
          ({ repositories }) => ({
            repositories,
            projectKey: p.key
          })
        );
      })
    ).then(results => {
      return results.reduce((acc: T.Dict<BitbucketRepository[]>, { projectKey, repositories }) => {
        return { ...acc, [projectKey]: repositories };
      }, {});
    });
  };

  handlePersonalAccessTokenCreate = (token: string) => {
    const { bitbucketSetting } = this.state;

    if (!bitbucketSetting || token.length < 1) {
      return;
    }

    this.setState({ submittingToken: true });
    setAlmPersonalAccessToken(bitbucketSetting.key, token)
      .then(() => {
        if (this.mounted) {
          this.setState({ submittingToken: false });
          this.fetchInitialData();
        }
      })
      .catch(() => {
        if (this.mounted) {
          this.setState({ submittingToken: false });
        }
      });
  };

  handleImportRepository = () => {
    const { bitbucketSetting, selectedRepository } = this.state;

    if (!bitbucketSetting || !selectedRepository) {
      return;
    }

    this.setState({ importing: true });
    importBitbucketServerProject(
      bitbucketSetting.key,
      selectedRepository.projectKey,
      selectedRepository.slug
    )
      .then(({ project: { key } }) => {
        if (this.mounted) {
          this.setState({ importing: false });
          this.props.onProjectCreate([key]);
        }
      })
      .catch(() => {
        if (this.mounted) {
          this.setState({ importing: false });
        }
      });
  };

  handleSelectRepository = (selectedRepository: BitbucketRepository) => {
    this.setState({ selectedRepository });
  };

  render() {
    const { canAdmin, loadingBindings } = this.props;
    const {
      bitbucketSetting,
      importing,
      loading,
      patIsValid,
      projectRepositories,
      projects,
      selectedRepository,
      submittingToken
    } = this.state;

    return (
      <BitbucketCreateProjectRenderer
        bitbucketSetting={bitbucketSetting}
        canAdmin={canAdmin}
        importing={importing}
        loading={loading || loadingBindings}
        onImportRepository={this.handleImportRepository}
        onPersonalAccessTokenCreate={this.handlePersonalAccessTokenCreate}
        onProjectCreate={this.props.onProjectCreate}
        onSelectRepository={this.handleSelectRepository}
        projectRepositories={projectRepositories}
        projects={projects}
        selectedRepository={selectedRepository}
        showPersonalAccessTokenForm={!patIsValid}
        submittingToken={submittingToken}
      />
    );
  }
}

const mapStateToProps = (state: Store) => {
  const { canAdmin } = getAppState(state);
  return { canAdmin };
};

export default connect(mapStateToProps)(BitbucketProjectCreate);
