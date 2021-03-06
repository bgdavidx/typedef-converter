/* @flow */
import _ from 'lodash'

import * as ts from 'typescript';

import {readFileSync} from "fs";
import tree from './tree';

import getNodeName from './nodeName';

import printer, { parseTypeReference } from './printer';

const parseNameFromNode = (node, context) => {
  if (node.name && node.name.text) {
    return node.name.text;
  }

  else if (node.type && node.type.typeName) {
    return node.type.typeName.text;
  }

  else if (node.moduleSpecifier) {
    return node.moduleSpecifier.text;
  }

console.log('wat', node)
throw new Error()

  return 'wat';
}

const parseNode = (node, context) => {
  const stripped = stripDetailsFromTree(node);
  stripped.name = { text: parseNameFromNode(stripped) };

  if (_.some(stripped.modifiers, modifier => modifier.kind === 'ExportKeyword')) {
    markNodeForExporting(stripped, context);
  }


  return stripped;
}

const collectFunctionFromNode = (node, context) => {
  tree.pushFunction(parseNode(node, context), context);
}

const collectInterfaceFromNode = (node, context) => {
  tree.pushInterface(parseNode(node, context), context);
}

const collectTypeFromNode = (node, context) => {
  tree.pushType(parseNode(node, context), context);
}

const collectClassFromNode = (node, context) => {
  tree.pushClass(parseNode(node, context), context);
}

const collectVariableFromNode = (node, context) => {
  const variables = node.declarationList.declarations.map(declaration => {
    const typeName = declaration.type.typeName;

    if (!typeName) {
      return null;
    }

    if (typeName.left && typeName.right) {
      return {
        name: declaration.name.text,
        value: typeName.right.text,
        valueContext: typeName.left.text
      }
    }

    return {
      context: 'root',
      name: declaration.name.text,
      value: typeName.text
    }
  }).filter(Boolean);

  variables.forEach(variable => {
    tree.pushVariable(variable, context);
  });
}

const markNodeForExporting = (node, context) => {
  //console.log('export', node)
  /*tree.pushExport({
    name: node.name.text ? node.name.text : node.name,
    type: node.kind,
    isDefault: false
  }, context);*/

}

const collectExportAssignmentFromNode = (node, context) => {
  tree.pushExport({
    name: node.expression.text,
    isDefault: true
  }, context);
}


const collectImportFromNode = (node, context: string) => {
  // Import in the style of "import 'whatwg-fetch'"
  if (!node.importClause) {
    tree.pushImport({
      type: 'default',
      what: 'npm$import$' + Math.round(Math.random() * 1000),
      from: node.moduleSpecifier.text
    })
  }

  else if (node.importClause.name) {
      // Import in the style of "import React from 'react'"
      tree.pushImport({
          type: 'default',
          what: node.importClause.name,
          from: node.moduleSpecifier.text
      })
  }

  else if (node.importClause.namedBindings) {
      if (node.importClause.namedBindings.name) {
          // Import in the style of "import * as React from 'react'"
          tree.pushImport({
              type: 'default',
              what: node.importClause.namedBindings.name.text,
              from: node.moduleSpecifier.text
          })
      } else {
          // Import in the style of "import { Component } from 'react'"
          node.importClause.namedBindings.elements.forEach(element => {
              tree.pushImport({
                  type: 'explicit',
                  what: element.name.text,
                  from: node.moduleSpecifier.text
              })
          })
      }
  }
}

// Traverse the AST and strip information we dont care about
// This is mostly to make debugging a bit less verbose
const stripDetailsFromTree = (root) => {
  const clone = _.omit(root, ['pos', 'end', 'parent', 'flags'])

  for (const key in clone) {
    const val = clone[key];

    if (clone.hasOwnProperty(key) && typeof val === 'object') {
      if (_.isArray(val)) {
        clone[key] = val.map(item => stripDetailsFromTree(item));
      } else {
        clone[key] = stripDetailsFromTree(val);
      }
    }
  }

  // Use actual names instead of node type IDs
  clone.kind = getNodeName(clone);

  return clone;
}

// Walk the AST and extract all the definitions we care about
export const recursiveWalkTree = (ast, context = 'root') => {
  ast.statements.forEach(node => {
    switch (node.kind) {
      case ts.SyntaxKind.ModuleDeclaration:
        if (node.flags === 4098 /* TODO: Replace with namespace flag enum */) {
          tree.pushNamespace(node.name.text);

          // Create fake module based on the namespace
          recursiveWalkTree(node.body, 'npm$namespace$' + node.name.text); break;
        } else {
          recursiveWalkTree(node.body, node.name.text); break;
        }

      case ts.SyntaxKind.FunctionDeclaration:
        collectFunctionFromNode(node, context); break;

      case ts.SyntaxKind.InterfaceDeclaration:
        collectInterfaceFromNode(node, context); break;

      case ts.SyntaxKind.TypeAliasDeclaration:
        collectTypeFromNode(node, context); break;

      case ts.SyntaxKind.ClassDeclaration:
        collectClassFromNode(node, context); break;

      case ts.SyntaxKind.VariableStatement:
        collectVariableFromNode(node, context); break;

      case ts.SyntaxKind.ExportAssignment:
        collectExportAssignmentFromNode(node, context); break;

      case ts.SyntaxKind.ImportDeclaration:
        collectImportFromNode(node, context); break;
    }
  })
}
