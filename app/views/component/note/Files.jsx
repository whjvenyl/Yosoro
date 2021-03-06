import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { Input, message, Icon } from 'antd';
import { ipcRenderer } from 'electron';
import { createFile, renameNote, deletNote, updateNoteDesc, trashBack, updateNoteUploadStatus, UPLOAD_NOTE_ONEDRIVER } from '../../actions/projects';
import { formatDate, pushStateToStorage, mergeStateFromStorage } from '../../utils/utils';
import { readFile, beforeSwitchSave, saveContentToTrashFile, updateCurrentTitle, clearMarkdown, MARKDOWN_UPLOADING } from '../../actions/markdown';
import { switchFile, clearNote } from '../../actions/note';
import { getNote } from '../../utils/db/app';

import oneDriverLogo from '../../assets/images/onedriver.png';

export default class Files extends Component {
  static displayName = 'NoteExplorerFiles';
  static propTypes = {
    dispatch: PropTypes.func.isRequired,
    parentsId: PropTypes.string.isRequired,
    projectName: PropTypes.string.isRequired,
    notes: PropTypes.arrayOf(PropTypes.shape({
      uuid: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      description: PropTypes.string.isRequired,
      labels: PropTypes.arrayOf(PropTypes.string).isRequired,
      status: PropTypes.number.isRequired,
      oneDriver: PropTypes.number.isRequired,
    })).isRequired,
    currentUuid: PropTypes.string.isRequired,
    editorMode: PropTypes.string.isRequired,
    searchStatus: PropTypes.number.isRequired,
    hasEdit: PropTypes.bool.isRequired,
  };

  constructor() {
    super();
    this.state = mergeStateFromStorage('noteExplorerFilesState', {
      newFile: false,
      newFileTitle: 'New Note',
      renameUuid: -1,
      newName: '',
      contextNote: {
        uuid: '',
        name: '',
        description: '',
        oneDriver: 0,
      },
      rename: {
        uuid: '',
        name: '',
      },
      desc: {
        uuid: '',
        value: '',
      },
    });
    this.selectNew = false;
  }

  componentDidMount() {
    ipcRenderer.on('new-file', () => {
      this.setState({
        newFile: true,
      }, () => {
        this.newItemFocus();
      });
    });
    ipcRenderer.on('delete-note', () => {
      const { projectName, parentsId, dispatch, currentUuid } = this.props;
      const { name, uuid } = this.state.contextNote;
      const data = ipcRenderer.sendSync('move-file-to-trash', {
        name,
        projectName,
      });
      if (!data.success) {
        message.error('Delete note failed.');
        return false;
      }
      dispatch(deletNote(uuid, parentsId, name, projectName));
      dispatch(trashBack());
      if (uuid === currentUuid) {
        dispatch(saveContentToTrashFile(projectName));
        dispatch(clearMarkdown());
        dispatch(clearNote());
      }
    });
    ipcRenderer.on('rename-note', () => {
      const { contextNote: { uuid, name } } = this.state;
      this.setState({
        rename: {
          uuid,
          name,
        },
      }, () => {
        if (this.titleIpt) {
          this.titleIpt.focus();
        }
      });
    });
    ipcRenderer.on('node-add-desc', () => {
      const { uuid, description } = this.state.contextNote;
      this.setState({
        desc: {
          uuid,
          value: description,
        },
      }, () => {
        if (this.descIpt) {
          this.descIpt.focus();
        }
      });
    });
    ipcRenderer.on('upload-note-onedriver', () => {
      this.handleUpload();
    });
  }

  componentWillReceiveProps(nextProps) {
    if (this.props.parentsId === nextProps.parentsId && this.selectNew) {
      const { dispatch, projectName } = this.props;
      const item = nextProps.notes[0];
      dispatch(beforeSwitchSave(projectName));
      dispatch(switchFile(item.uuid));
      const data = ipcRenderer.sendSync('read-file', {
        projectName,
        fileName: item.name,
      });
      if (!data.success) {
        message.error('Failed to read file data.');
        return false;
      }
      item.content = data.data;
      this.props.dispatch(readFile(item));
      this.selectNew = false;
    }
    return true;
  }

  componentWillUnmount() {
    pushStateToStorage('noteExplorerFilesState', Object.assign({}, this.state, {
      contextNote: {
        uuid: '',
        name: '',
        description: '',
      },
      rename: {
        uuid: '',
        name: '',
      },
      desc: {
        uuid: '',
        value: '',
      },
    }));
    ipcRenderer.removeAllListeners('new-file');
    ipcRenderer.removeAllListeners('delete-note');
    ipcRenderer.removeAllListeners('rename-note');
    ipcRenderer.removeAllListeners('node-add-desc');
    ipcRenderer.removeAllListeners('upload-note-onedriver');
  }

  newItemFocus = () => {
    if (this.fileIpt) {
      this.fileIpt.focus();
    }
  }

  // 上传文件
  handleUpload = () => {
    const { contextNote: { uuid, name, oneDriver } } = this.state;
    const { parentsId, projectName, dispatch } = this.props;
    if (oneDriver === 2) {
      return false;
    }
    // let toolbar = false;
    // if (currentUuid === uuid) {
    //   toolbar = true;
    //   dispatch({
    //     type: MARKDOWN_UPLOADING,
    //   });
    // }
    dispatch({
      type: MARKDOWN_UPLOADING,
    });
    dispatch({
      type: UPLOAD_NOTE_ONEDRIVER,
      param: {
        uuid,
        name,
        projectUuid: parentsId,
        projectName,
      },
      toolbar: true,
    });
  }

  // 右键菜单事件
  handleContextMenu = (event) => {
    event.stopPropagation();
    event.preventDefault();
    const { searchStatus } = this.props;
    if (searchStatus === 1) {
      return false;
    }
    ipcRenderer.send('show-context-menu-explorer-file');
  }

  // 新建输入框改变事件
  handleChange = (e, type) => {
    const title = e.target.value;
    if (type === 'new') {
      this.setState({
        newFileTitle: title,
      });
    } else if (type === 'edit') {
      this.setState({
        rename: {
          uuid: this.state.contextNote.uuid,
          name: title,
        },
      });
    } else if (type === 'desc') {
      this.setState({
        desc: {
          uuid: this.state.contextNote.uuid,
          value: title,
        },
      });
    }
  }

  // 输入框聚焦
  handleFocus = (e) => {
    e.stopPropagation();
    e.target.select();
  }

  // 点击输入框
  handleIptClick = (e) => {
    e.stopPropagation();
  }

  // 输入框失焦事件
  handleBlur = (e, type) => {
    e.stopPropagation();
    if (type === 'new') { // 新建笔记
      this.createFile();
    } else if (type === 'edit') {
      this.editTitle();
    } else if (type === 'desc') {
      this.updateDesc();
    }
  }

  // 输入框回车键事件
  handleKeyDown = (e, type) => {
    if (e.keyCode === 13) {
      if (type === 'new') {
        this.createFile();
      } else if (type === 'edit') {
        this.editTitle();
      } else if (type === 'desc') {
        this.updateDesc();
      }
    }
  }

  /**
   * @description 新建笔记
   */
  createFile = () => {
    const name = this.state.newFileTitle || 'New Note';
    const { parentsId, projectName } = this.props;
    const fileData = ipcRenderer.sendSync('create-file', {
      name,
      projectName,
    });
    if (!fileData.success) {
      const error = fileData.error;
      if (error.errno === -10000) {
        message.error('File is exists.');
      } else {
        message.error('Create file failed.');
      }
      this.setState({
        newFile: false,
        newFileTitle: 'New Note',
      });
      return false;
    }
    // const file = fileData.file;
    this.setState({
      newFile: false,
      newFileTitle: 'New Note',
    });
    const createDate = (new Date()).toString();
    this.props.dispatch(createFile({
      name,
      createDate,
      parentsId,
    }));
    this.selectNew = true;
  }

  editTitle = () => {
    const { parentsId, dispatch, projectName } = this.props;
    const { uuid, name } = this.state.rename;
    if (name === '' || name === this.state.contextNote.name) {
      this.setState({
        rename: {
          uuid: '',
          name: '',
        },
      });
    } else {
      const oldName = this.state.contextNote.name;
      const arr = this.props.notes.filter(item => item.name === name);
      if (arr.length !== 0) {
        message.error('Name repeat.');
        return false;
      }
      const data = ipcRenderer.sendSync('rename-note', {
        oldName,
        newName: name,
        projectName,
      });
      if (!data.success) {
        message.error('Rename notebook failed.');
        return false;
      }
      dispatch(renameNote(uuid, name, parentsId));
      dispatch(updateCurrentTitle(uuid, name));
      this.setState({
        rename: {
          uuid: '',
          name: '',
        },
      });
    }
  }

  // 更新笔记描述
  updateDesc = () => {
    const { uuid, value } = this.state.desc;
    if (value === this.state.contextNote.description) {
      this.setState({
        desc: {
          uuid: '',
          value: '',
        },
      });
      return false;
    }
    const { parentsId, dispatch } = this.props;
    dispatch(updateNoteDesc(uuid, value, parentsId));
    this.setState({
      desc: {
        uuid: '',
        value: '',
      },
    });
  }

  // 选中当前笔记文件
  handleChoose = (item) => {
    const { dispatch, projectName, parentsId, currentUuid, hasEdit } = this.props;
    if (currentUuid === item.uuid) {
      return false;
    }
    if (hasEdit) {
      const note = getNote(currentUuid);
      let needUpdateCloudStatus = false;
      if (note && note.oneDriver !== 0) {
        needUpdateCloudStatus = true;
      }
      dispatch(beforeSwitchSave(projectName, needUpdateCloudStatus));
      if (needUpdateCloudStatus) {
        dispatch(updateNoteUploadStatus(parentsId, currentUuid, 1));
      }
    }
    dispatch(switchFile(item.uuid));
    const data = ipcRenderer.sendSync('read-file', {
      projectName,
      fileName: item.name,
    });
    if (!data.success) {
      message.error('Failed to read file data.');
      return false;
    }
    item.content = data.data;
    this.props.dispatch(readFile(item));
  }

  handleItemMenu = (event, uuid, name, description, oneDriver) => {
    event.stopPropagation();
    event.preventDefault();
    this.setState({
      contextNote: {
        uuid,
        name,
        description,
        oneDriver,
      },
    });
    const { searchStatus } = this.props;
    if (searchStatus === 1) {
      return false;
    }
    ipcRenderer.send('show-context-menu-file-item');
  }

  renderCloudIcon = (status) => {
    if (status === 0) { // 未上传过
      return null;
    }
    let classname = '';
    switch (status) {
      case 1: // 有修改但未上传
        classname = 'need-upload';
        break;
      case 2: // 上传中
        classname = 'upload';
        break;
      case 3: // 上传成功
        classname = 'success';
        break;
      case 4:
        classname = 'fail';
        break;
      default:
        classname = '';
        break;
    }
    return (
      <span className={`clouds-item ${classname}`}>
        <img src={oneDriverLogo} alt="logo" className="cloud-logo" />
        {status === 2 ? (
          <Icon type="loading" />
        ) : null}
      </span>
    );
  }

  // 渲染新建文件
  renderNewFile() {
    const iconHtml = '<use class="icon-use" xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="#icon_svg_markdown" />';
    const { newFileTitle } = this.state;
    return (
      <div className="file-list__item new">
        <div className="file-list__item__root">
          <span className="file-list__item__icon">
            <svg className="file-list__item__icon__svg" version="1.1" viewBox="0 0 48 48" dangerouslySetInnerHTML={{ __html: iconHtml }} />
          </span>
          <span className="file-list__item__name">
            <Input
              className="edit"
              value={newFileTitle}
              onChange={e => this.handleChange(e, 'new')}
              onFocus={this.handleFocus}
              onBlur={e => this.handleBlur(e, 'new')}
              onKeyDown={e => this.handleKeyDown(e, 'new')}
              onClick={this.handleIptClick}
              ref={node => (this.fileIpt = node)}
            />
          </span>
        </div>
        <div className="file-list__item__info" />
      </div>
    );
  }

  render() {
    const { notes, currentUuid, editorMode } = this.props;
    const { newFile, rename, desc } = this.state;
    const iconHtml = '<use class="icon-use" xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="#icon_svg_markdown" />';
    let rootClass = '';
    if (editorMode !== 'normal') {
      rootClass = 'hide';
    }
    if (notes.length === 0) {
      return (
        <div className={`file-explorer ${rootClass}`} onContextMenu={this.handleContextMenu}>
          <ul
            className="file-list height-block"
          >
            { newFile ? this.renderNewFile() : (
              <p className="tips no-select">No notes have been created.</p>
            )}
          </ul>
        </div>
      );
    }
    return (
      <div className={`file-explorer fade-in ${rootClass}`} onContextMenu={this.handleContextMenu}>
        <ul
          className="file-list"
        >
          {newFile ? this.renderNewFile() : (null) }
          {notes.map((note) => {
            const { uuid, status, name, description, oneDriver } = note;
            if (status === 0) { // 删除
              return null;
            }
            let disabled = true;
            let edit = '';
            if (rename.uuid === uuid) {
              disabled = false;
              edit = 'edit';
            }
            let active = '';
            if (uuid === currentUuid) {
              active = 'cur';
            }
            return (
              <li
                key={`n-${uuid}`}
                className={`file-list__item ${active}`}
                onClick={() => this.handleChoose(note)}
                onContextMenu={e => this.handleItemMenu(e, uuid, name, description, oneDriver)}
                role="presentation"
              >
                <div className="file-list__item__root">
                  <span className="file-list__item__icon">
                    <svg className="file-list__item__icon__svg" version="1.1" viewBox="0 0 48 48" dangerouslySetInnerHTML={{ __html: iconHtml }} />
                  </span>
                  <span className="file-list__item__name">
                    {disabled ? (
                      <h3>{name}</h3>
                    ) : (
                      <Input
                        className={edit}
                        value={rename.name}
                        disabled={disabled}
                        onChange={e => this.handleChange(e, 'edit')}
                        onFocus={this.handleFocus}
                        onBlur={e => this.handleBlur(e, 'edit')}
                        onKeyDown={e => this.handleKeyDown(e, 'edit')}
                        onClick={this.handleIptClick}
                        ref={node => (this.titleIpt = node)}
                      />
                    )}
                  </span>
                </div>
                <div className="file-list__item__info">
                  <div className="file-list__item__info__desc">
                    {desc.uuid === uuid ? (
                      <Input
                        value={desc.value}
                        onFocus={this.handleFocus}
                        onClick={this.handleIptClick}
                        onChange={e => this.handleChange(e, 'desc')}
                        onBlur={e => this.handleBlur(e, 'desc')}
                        onKeyDown={e => this.handleKeyDown(e, 'desc')}
                        maxLength="20"
                        placeholder="Limit 20 chars."
                        ref={node => (this.descIpt = node)}
                      />
                    ) : (
                      <p>{note.description}</p>
                    )}
                  </div>
                  <div className="file-list__item__info__desc" />
                  <div className="file-list__item__info__desc">
                    <p className="date-p">{formatDate(note.latestDate)}</p>
                  </div>
                </div>
                <ul className="clouds">
                  {this.renderCloudIcon(note.oneDriver)}
                </ul>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }
}
