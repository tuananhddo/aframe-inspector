/* eslint-disable no-unused-vars, react/no-danger */
import React from 'react';
import PropTypes from 'prop-types';
import classnames from 'classnames';
import debounce from 'lodash.debounce';
import {removeEntity, cloneEntity} from '../../actions/entity';
import Toolbar from './Toolbar';
const Events = require('../../lib/Events.js');

const ICONS = {
  camera: 'fa-camera',
  mesh: 'fa-cube',
  light: 'fa-lightbulb-o',
  text: 'fa-font'
};

const gaTrackSearchEntity = debounce(() => {
  ga('send', 'event', 'SceneGraph', 'searchEntity');
}, 3000);

export default class SceneGraph extends React.Component {
  static propTypes = {
    id: PropTypes.string,
    onChange: PropTypes.func,
    scene: PropTypes.object,
    value: PropTypes.string,
    visible: PropTypes.bool
  };

  static defaultProps = {
    value: '',
    index: -1,
    id: 'left-sidebar'
  }

  constructor (props) {
    super(props);
    this.state = {
      value: this.props.value || '',
      filteredOptions: [],
      options: [],
      selectedIndex: -1,
      filterText: '',
      expandedElements: new WeakMap([[props.scene, true]])
    };

    this.handleSceneGraphFilter = debounce(this.handleSceneGraphFilter.bind(this), 500);
  }

  componentDidMount () {
    this.rebuildOptions();

    document.addEventListener('componentremoved', () => {
      this.forceUpdate();
    });

    Events.on('entityselected', (entity, self) => {
      if (self) { return; }
      this.setValue(entity);
    });
    Events.on('entityidchanged', this.rebuildOptions);
    document.addEventListener('componentremoved', this.rebuildOptions);
    Events.on('dommodified', this.rebuildOptions);
  }

  setValue = value => {
    let found = false;
    for (let i = 0; i < this.state.options.length; i++) {
      const element = this.state.options[i];
      if (element.value === value) {
        this.setState({value: value, selectedIndex: i});
        this.expandToRoot(element.value); // Make sure selected value is visible in scenegraph
        if (this.props.onChange) {
          this.props.onChange(value);
        }
        Events.emit('entityselected', value, true);
        found = true;
      }
    }

    if (!found) {
      this.setState({value: null, selectedIndex: -1});
    }
    ga('send', 'event', 'SceneGraph', 'selectEntity');
  }

  update = e => {
    this.setValue(e.target.value);
  }

  rebuildOptions = () => {
    const options = [{static: true, value: this.props.scene, tagName: 'a-scene', hasChildren: true, depth: 0}];

    function treeIterate (element, depth) {
      if (!element) { return; }
      depth += 1;

      let children = element.children;
      for (let i = 0; i < children.length; i++) {
        let child = children[i];

        if (!child.dataset.isInspector && child.isEntity && !child.isInspector) {
          let extra = '';

          for (let objType in ICONS) {
            if (!child.getObject3D(objType)) { continue; }
            extra += '&nbsp;<i class="component fa ' + ICONS[objType] + '" title="' + objType + '"></i>';
          }

          options.push({
            static: true,
            depth: depth,
            value: child,
            hasChildren: child.children.length > 0,
            tagName: child.tagName.toLowerCase(),
            id: child.id,
            extra: extra
          });

          treeIterate(child, depth);
        }
      }
    }
    treeIterate(this.props.scene, 0);

    this.setState({filteredOptions: options, options: options}, () => {
      this.handleSceneGraphFilter();
    });
  }

  selectIndex = index => {
    if (index >= 0 && index < this.state.options.length) {
      this.setValue(this.state.options[index].value);
    }
  }

  onFilterKeyUp = event => {
    if (event.keyCode === 27) {
      this.clearFilter();
    }
  }

  onKeyDown = event => {
    switch (event.keyCode) {
      case 37: // left
      case 38: // up
      case 39: // right
      case 40: // down
        event.preventDefault();
        event.stopPropagation();
        break;
    }
  }

  onKeyUp = event => {
    if (this.state.value === null) {
      return;
    }
    switch (event.keyCode) {
      case 37: // left
        if (this.isExpanded(this.state.value)) {
          this.toggleExpandedCollapsed(this.state.value);
        }
        ga('send', 'event', 'SceneGraph', 'navigateWithKeyboard');
        break;
      case 38: // up
        this.selectIndex(this.previousExpandedIndexTo(this.state.selectedIndex));
        ga('send', 'event', 'SceneGraph', 'navigateWithKeyboard');
        break;
      case 39: // right
        if (!this.isExpanded(this.state.value)) {
          this.toggleExpandedCollapsed(this.state.value);
        }
        ga('send', 'event', 'SceneGraph', 'navigateWithKeyboard');
        break;
      case 40: // down
        this.selectIndex(this.nextExpandedIndexTo(this.state.selectedIndex));
        ga('send', 'event', 'SceneGraph', 'navigateWithKeyboard');
        break;
    }
  }

  cloneEntity = option => {
    cloneEntity(option);
    ga('send', 'event', 'SceneGraph', 'cloneEntity');
  }

  toggleVisibility = (entity, event) => {
    var visible = entity.tagName.toLowerCase() === 'a-scene'
      ? entity.object3D.visible
      : entity.getAttribute('visible');
    entity.setAttribute('visible', !visible);
  }

  handleSceneGraphFilter () {
    const filterText = this.state.filterText.toUpperCase();
    const isFiltering = filterText.length > 0;
    this.setState({
      filteredOptions: this.state.options.filter((option, idx) => {
        const value = option.value;

        // Check if the ID, tagName, class, selector includes the filterText.
        if (value.id.toUpperCase().indexOf(filterText) > -1 ||
            value.tagName.toUpperCase().indexOf(filterText) > -1 ||
            (value.getAttribute('class') || '').indexOf(filterText) > -1 ||
            value.matches(this.state.filterText)) {
          return true;
        }

        // Check each component's name
        for (let i in value.components) {
          const component = value.components[i];
          if (component.attrName.toUpperCase().indexOf(filterText) > -1) { return true; }

          for (let j in component.data) {
            if (!component.data[j]) { continue; }
            const data = component.data[j].toString();
            if (data.toUpperCase().indexOf(filterText) > -1) { return true; }
          }
        }
        return false;
      })
    });
  }

  renderSceneGraph () {
    var filterText = this.state.filterText.toUpperCase();
    var isFiltering = filterText.length > 0;

    return this.state.filteredOptions
      .map((option, idx) => {
        // If searching expand everything.
        const isExpanded = this.isExpanded(option.value) || isFiltering;
        if (!isFiltering && !this.isVisibleInSceneGraph(option.value)) {
           return null;
        }

        let cloneButton = (
          <a onClick={() => this.cloneEntity(option.value)}
             title="Clone entity" className="button fa fa-clone"></a>
        );
        let removeButton = (
          <a onClick={event => { event.stopPropagation(); removeEntity(option.value); }}
             title="Remove entity" className="button fa fa-trash-o"></a>
        );

        if (option.value.tagName === 'A-SCENE') {
          cloneButton = '';
          removeButton = '';
        }

        const pad = '    '.repeat(option.depth);
        let collapse;
        if (option.hasChildren && !isFiltering) {
          const expandedElements = this.state.expandedElements;
          collapse = (
            <span onClick={() => this.toggleExpandedCollapsed(option.value)}
                  className={`collapsespace fa ${isExpanded ? 'fa-caret-down' : 'fa-caret-right'}`}></span>
          );
        } else {
          collapse = <span className="collapsespace"></span>;
        }
        let entity = option.value;
        const visible = entity.tagName.toLowerCase() === 'a-scene' ? entity.object3D.visible : entity.getAttribute('visible');
        let visibility = (
          <i title="Toggle entity visibility" className={'fa ' + (visible ? 'fa-eye' : 'fa-eye-slash')}
             onClick={event => { this.toggleVisibility(option.value, event); }}></i>
        );

        const className = classnames({
          option: true,
          active: option.value === this.state.value,
          novisible: !visible
        });

        let entityName = option.id;
        if (!entity.isScene && !entityName && entity.getAttribute('class')) {
          entityName = entity.getAttribute('class').split(' ')[0];
        }
        if (!entity.isScene && !entityName && entity.getAttribute('mixin')) {
          entityName = entity.getAttribute('mixin').split(' ')[0];
        }

        return (
          <div key={idx} className={className} value={option.value}
            onClick={() => this.setValue(option.value)}>
            <span>
              {visibility} {pad} {collapse}&lt;
              <span onDoubleClick={() => Events.emit('objectfocus', entity.object3D)}>
                {option.tagName}<span className="name">{entityName ? ` ${entityName}` : ''}</span>
              </span>
              <span dangerouslySetInnerHTML={{__html: option.extra}}></span>&gt;
            </span>
            <span className="icons">
              {cloneButton}
              {removeButton}
            </span>
          </div>
        );
      });
  }

  isVisibleInSceneGraph = x => {
    let curr = x.parentEl;
    while (curr !== undefined && curr.isEntity) {
      if (!this.isExpanded(curr)) {
        return false;
      }
      curr = curr.parentEl;
    }
    return true;
  }

  isExpanded = x => this.state.expandedElements.get(x) === true

  toggleExpandedCollapsed = x => {
    this.setState({expandedElements: this.state.expandedElements.set(x, !this.isExpanded(x))})
  }

  expandToRoot = x => {
    // Expand element all the way to the scene element
    let curr = x.parentEl;
    while (curr !== undefined && curr.isEntity) {
      this.state.expandedElements.set(curr, true);
      curr = curr.parentEl;
    }
    this.setState({expandedElements: this.state.expandedElements});
  }

  previousExpandedIndexTo = i => {
    for (let prevIter = i - 1; prevIter >= 0; prevIter--) {
      const prevEl = this.state.options[prevIter].value;
      if (this.isVisibleInSceneGraph(prevEl)) {
        return prevIter;
      }
    }
    return -1;
  }

  nextExpandedIndexTo = i => {
    for (let nextIter = i + 1; nextIter < this.state.options.length; nextIter++) {
      const nextEl = this.state.options[nextIter].value;
      if (this.isVisibleInSceneGraph(nextEl)) {
        return nextIter;
      }
    }
    return -1;
  }

  onChangeFilter = e => {
    this.setState({filterText: e.target.value});
    this.handleSceneGraphFilter();
  }

  clearFilter = () => {
    this.setState({filterText: ''});
  }

  render () {
    // To hide the SceneGraph we have to hide its parent too (#left-sidebar).
    if (!this.props.visible) { return null; }

    let clearFilter = this.state.filterText
      ? <a onClick={this.clearFilter} className='button fa fa-times'></a>
      : null;

    return (
      <div id={this.props.id} className='scenegraph'>
        <div className='scenegraph-toolbar'>
          <Toolbar/>
          <div className='search'>
            <input id="filter" placeholder='Search...' value={this.state.filterText}
                   onChange={this.onChangeFilter} onKeyUp={this.onFilterKeyUp}/>
            {clearFilter}
            <span className='fa fa-search'></span>
          </div>
        </div>
        <div className='outliner' tabIndex='0' onKeyDown={this.onKeyDown}
             onKeyUp={this.onKeyUp}>
          {this.renderSceneGraph()}
        </div>
      </div>
    );
  }
}
